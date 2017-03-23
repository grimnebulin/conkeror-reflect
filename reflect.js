"use strict";

// Copyright 2016 Sean McAfee

// This file is part of conkeror-reflect.

// conkeror-reflect is free software: you can redistribute it and/or
// modify it under the terms of the GNU General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// conkeror-reflect is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with conkeror-reflect.  If not, see
// <http://www.gnu.org/licenses/>.


{
    const reflect = (function () {
        const scope = { };
        Components.utils.import("resource://gre/modules/reflect.jsm", scope);
        return scope.Reflect;
    })();

    const toMap = function (obj) {
        if (!obj) {
            return new Map;
        } else if (obj instanceof Map) {
            return obj;
        } else {
            const map = new Map;
            for (let name in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, name)) {
                    map.set(name, obj[name]);
                }
            }
            return map;
        }
    };

    var AST = AST || { };

    AST.AST = function (program) {
        this.program = program;
    };

    AST.parse = function (str) {
        return reflect.parse(str);
    };

    AST.create = function (str) {
        return new AST.AST(AST.parse(str));
    };

    let evaluateMemberExpression;

    let evaluate = function (node, ns) {
        ns = toMap(ns);
        switch (node.type) {
        case "Literal":
            return node.value;
        case "Identifier":
            if (ns.has(node.name)) {
                return ns.get(node.name);
            } else {
                throw "Identifier \"" + node.name + "\" not found";
            }
        case "MemberExpression":
            return evaluateMemberExpression(node, ns);
        case "UnaryExpression":
            switch (node.operator) {
            case "-":
                return -evaluate(node.argument, ns);
            default:
                throw "Don't know how to evaluate unary operator \"" + node.operator + "\"";
            }
        case "BinaryExpression":
            const left  = () => evaluate(node.left, ns);
            const right = () => evaluate(node.right, ns);
            switch (node.operator) {
            case "+":
                return left() + right();
            case "-":
                return left() - right();
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
            field = node.computed ? evaluate(node.property, ns) : node.property.name;
            ns    = evaluateMemberExpression(node.object, ns);
            break;
        default:
            throw "Can't handle " + node.type;
        }

        if (ns.has(field)) {
            return ns.get(field);
        } else {
            throw "Field \"" + field + "\" not found";
        }

    };

    AST.evaluate = AST.AST.prototype.evaluate = evaluate;

    const keyOf = prop => prop.key[prop.key.type === "Literal" ? "value" : "name"];

    const specialExpressions = {
        ObjectExpression: {
            ObjectLiteral: function (node, callback) {
                const map = new Map;
                for (let property of node.properties) {
                    map.set(keyOf(property), property.value);
                }
                return callback.call(this, map);
            },
            KeyValuePair: function (node, callback) {
                let done = false;
                for (let property of node.properties) {
                    if (callback.call(this, keyOf(property), property.value)) {
                        done = true;
                    }
                }
                return done;
            }
        }
    };

    const specialStatements = {
        VariableDeclaration: {
            Variable: function (node, callback) {
                let done = false;
                for (let decl of node.declarations) {
                    if (decl.id.type === "Identifier" &&
                        callback.call(this, decl.id.name, decl.init, node.kind)) {
                        done = true;
                    }
                }
                return done;
            }
        }
    };

    AST.AST.prototype.visit = function (callbacks) {

        const self = this;

        this.program.body.forEach(doStatement);

        function doStatement(node) {

            if (node.type in callbacks && callbacks[node.type].call(self, node))
                return;

            let special = specialStatements[node.type];

            if (special) {
                for (let key in special) {
                    if (key in callbacks && special[key].call(self, node, callbacks[key])) {
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

            if (node.type in callbacks && callbacks[node.type].call(self, node))
                done = true;

            let special = specialExpressions[node.type];

            if (special) {
                for (let key in special) {
                    if (key in callbacks && special[key].call(self, node, callbacks[key])) {
                        done = true;
                    }
                }
            }

            if (done) return;

            switch (node.type) {
            case "ArrayExpression":
                node.elements.forEach(x => { if (x) doExpression(x) });
                break;
            case "ObjectExpression":
                node.properties.forEach(x => doExpression(x.value));
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

}
