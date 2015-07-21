Components.utils.import("resource://gre/modules/reflect.jsm");

let specialExpressions = {
    ObjectExpression: {
        ObjectLiteral: function (node) {
            const hash = { };
            for (let property of node.properties) {
                hash[property.key[property.key.type === "Literal" ? "value" : "name"]] = property.value;
            }
            return hash;
        }
    }
};

function parseAndVisit(str, callbacks) {

    function doStatement(node) {
        if (callbacks.hasOwnProperty(node.type) && callbacks[node.type](node))
            return;
        switch (node.type) {
        case "BlockStatement":
            doStatements(node.body);
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

    function doStatements(stmts) {
        for (let stmt of stmts) {
            doStatement(stmt);
        }
    }

    function doExpression(node) {
        let done = false;

        if (callbacks.hasOwnProperty(node.type) && callbacks[node.type](node))
            done = true;

        let special = specialExpressions[node.type];

        if (special) {
            for (let key in special) {
                if (callbacks.hasOwnProperty(key) &&
                    callbacks[key](special[key](node))) {
                    done = true;
                }
            }
        }

        if (done) return;

        switch (node.type) {
        case "ArrayExpression":
            for (let elem of node.elements) {
                if (elem) {
                    doExpression(elem);
                }
            }
            break;
        case "ObjectExpression":
            // dumpln("Going over properties!");
            for (let prop of node.properties) {
                doExpression(prop.value);
            }
            break;
        case "FunctionExpression":
            switch (node.body.type) {
            case "BlockStatement":
                doStatement(node.body);
                break;
            default:
                doExpression(node.body);
                break;
            }
            break;
        case "AssignmentExpression":
            doExpression(node.right);
            break;
        case "CallExpression":
            for (let arg of node.arguments) {
                doExpression(arg);
            }
            doExpression(node.callee);
            break;
        default:
            // dumpln("Skipping expression " + node.type);
        }
    }

    const program = Reflect.parse(str);

    doStatements(program.body);

}
