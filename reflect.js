let scope = { };

Components.utils.import("resource://gre/modules/reflect.jsm", scope);

let has = (obj, field) => Object.prototype.hasOwnProperty.call(obj, field);


var AST = AST || { };

AST.AST = function (program) {
    this.program = program;
};

AST.parse = function (str) {
    return scope.Reflect.parse(str);
};

AST.create = function (str) {
    return new AST.AST(AST.parse(str));
};

let evaluateMemberExpression;

let evalNode = function (node, ns) {
    switch (node.type) {
    case "Literal":
        return node.value;
    case "Identifier":
        if (has(ns, node.name))
            return ns[node.name];
        else
            throw "Identifier \"" + node.name + "\" not found";
    case "MemberExpression":
        return evaluateMemberExpression(node, ns);
    case "BinaryExpression":
        const left  = () => evalNode(node.left, ns);
        const right = () => evalNode(node.right, ns);
        switch (node.operator) {
        case "+":
            return left() + right();
        default:
            throw "Don't know how to evaluate binary operator \"" + node.operator + "\"";
        }
    default:
        throw "Can't evaluate node of type \"" + node.type + "\"";
    }
};

evaluateMemberExpression = function (node, ns) {
    let field;

    switch (node.type) {
    case "Identifier":
        field = node.name;
        break;
    case "MemberExpression":
        field = node.computed ? evalNode(node.property) : node.property.name;
        ns    = evaluateMemberExpression(node.object, ns);
        break;
    default:
        throw "Can't handle " + node.type;
    }

    if (has(ns, field)) {
        return ns[field];
    } else {
        throw "Field \"" + field + "\" not found";
    }

};

AST.AST.prototype.evaluate = evalNode;

let key = prop => prop.key[prop.key.type === "Literal" ? "value" : "name"];

let specialExpressions = {
    ObjectExpression: {
        ObjectLiteral: function (node, callback) {
            const hash = { };
            for (let property of node.properties) {
                hash[key(property)] = property.value;
            }
            return callback.call(this, hash);
        },
        KeyValuePair: function (node, callback) {
            let done = false;
            for (let property of node.properties) {
                if (callback.call(key(property), property.value)) {
                    done = true;
                }
            }
            return done;
        }
    }
};

let specialStatements = {
    VariableDeclaration: {
        Variable: function (node, callback) {
            let done = false;
            for (let decl of node.declarations) {
                if (callback.call(this, decl)) {
                    done = true;
                }
            }
            return done;
        }
    }
}

AST.AST.prototype.visit = function (callbacks) {

    const self = this;

    this.program.body.forEach(doStatement);

    function doStatement(node) {

        if (has(callbacks, node.type) && callbacks[node.type].call(self, node))
            return;

        let special = specialStatements[node.type];

        if (special) {
            for (let key in special) {
                if (has(callbacks, key) && special[key].call(self, node, callbacks[key])) {
                    done = true;
                }
            }
        }


        switch (node.type) {
        case "BlockStatement":
            node.body.forEach(doStatement);
            break;
        case "ExpressionStatement":
            doExpression(node.expression);
            break;
        case "IfStatement":
            doExpression(node.test);
            doStatement(node.consequent);
            if (node.alternate)
                doStatement(node.alternate);
            break;
        case "LabeledStatment":
            doExpression(node.body);
            break;
        case "WithStatement":
            doExpression(node.object);
            /*recurseStmt(node.cases)*/;
            break;
        // case "ReturnStatement": if (node.argument) recurseExpr(node.argument); break;
        case "TryStatement":
            doStatement(node.block);
            /*...*/
            break;
        case "WhileStatement":
            doExpression(node.test);
            doStatement(node.body);
            break;
        case "DoWhileStatement":
            doStatement(node.body);
            doExpression(node.test);
            break;
        case "ForStatement":
            /* ... */
            doStatement(node.body);
            break;
        case "ForInStatement":
        case "ForOfStatement":
            /* ... */
            doStatement(node.body);
            break;
        /* case "LetStatement": recurseStmt(node.body); */
        case "VariableDeclaration":
            for (let declaration of node.declarations) {
                if (declaration.init) {
                    doExpression(declaration.init);
                }
            }
            break;
        case "FunctionDeclaration":
            switch (node.body.type) {
            case "BlockStatement":
                doStatement(node.body);
                break;
            default:
                doExpression(node.body);
                break;
            }
            break;
        default:
            // dumpln("Skipping statement " + stmt.type);
        }
    }

    function doExpression(node) {
        let done = false;

        if (has(callbacks, node.type) && callbacks[node.type].call(self, node))
            done = true;

        let special = specialExpressions[node.type];

        if (special) {
            for (let key in special) {
                if (has(callbacks, key) && special[key].call(self, node, callbacks[key])) {
                    done = true;
                }
            }
        }

        if (done) return;

        switch (node.type) {
        case "ArrayExpression":
            node.elements.filter(x => x).forEach(doExpression);
            break;
        case "ObjectExpression":
            node.properties.map(x => x.value).forEach(doExpression);
            break;
        case "FunctionExpression":
            if (node.body.type === "BlockStatement")
                doStatement(node.body);
            else
                doExpression(node.body);
            break;
        case "AssignmentExpression":
            doExpression(node.right);
            break;
        case "CallExpression":
            doExpression(node.callee);
            node.arguments.forEach(doExpression);
            break;
        default:
            // dumpln("Skipping expression " + node.type);
        }
    }

};
