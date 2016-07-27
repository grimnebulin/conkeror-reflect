# SUMMARY

`conkeror-reflect` is a package that provides a higher-level interface
to the Mozilla
[Parser API](https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API).
Javascript code can be parsed into an abstract syntax tree which can
then be recursively visited and, to a limited extent, evaluated.

The interface is far from complete, but it suffices for simple tasks
such as extracting data from Javascript source code.

# EXAMPLES

Evaluation of simple expressions is supported:

    const three = AST.evaluate(AST.parse("1+2").body[0].expression);
    
You can even provide a namespace of variables:

    const seven = AST.evaluate(
      AST.parse("a.b + c.d - 1").body[0].expression,
      { a: { b: 3 }, c: { d: 5 } }
    )

More generally, Javascript source code can be parsed into an abstract
syntax tree and traversed.  Suppose you had a Javascript source file
in the form of a string, perhaps downloaded using Ajax, and defined
inside the source code were a number of object literals, each of which
had keys `name`, `src`, and others:

    var files = [{
      "name": "GitHub",
      "src": "http://github.com/",
      // ... other attributes ...
    }, {
      "name": "Reddit",
      "src": "http://reddit.com/",
      // ... other attributes ...
    },
    // more objects
    ];

Using `conkeror-reflect` you could scan the source code for all object
literals that have those two keys and accumulate a mapping of `name`
to `src`:

    const sources = { };

    AST.create(jscode).visit({
      ObjectLiteral: function (attr) {
        if ("name" in attr && "src" in attr) {
          sources[attr.name] = this.evaluate(attr.src);
        }
      }
    });

# API

All functions live in the top-level object `AST`, which is created if
it does not already exist.

## Static methods

- `AST.parse(code)`

  A thin layer atop the browser's Parser API, this function just
  passes a string of Javascript code to the parser and returns the
  root `Program` node that it produces.  An exception is raised if
  the code is not well-formed.
  
- `AST.create(code)`

  This constructor function parses a string of Javascript code as
  `AST.parse` does, but wraps the root of the AST in an object of the
  class `AST.AST`, which is returned.

- `AST.evaluate(node, namespace)`

  Evaluates an AST expression node.  Only a small set of Parser API
  expression types are supported:
  
  - `Literal`
  - `Identifier`
  - `MemberExpression`
  - `UnaryExpression` (`-` only)
  - `BinaryExpression` (`+` and `-` only)
  
  An exception is thrown if a type of node other than these is
  encountered.

  `Identifier` expressions are looked up in the `namespace` argument,
  if one if provided.  Evaluating an identifier that is not defined
  there causes an exception to be thrown.
  
  `namespace` may contain nested arrays and objects:
  
      const node  = AST.parse("a[a[0]]").body[0].expression;
      const zero  = AST.evaluate(node, { a: [ 0, 1, 2 ]});
      const three = AST.evaluate(node, { a: [ 2, 1, 3 ]});

## Instance methods

- `ast.evaluate(node)`

  An instance version of the static `evaluate` function described
  above.

- `ast.visit(callbacks)`
  
  Recursively visits the nodes of the abstract syntax tree whose root
  is contained in the `ast` object.  `callbacks` is a mapping of node
  names to functions that are invoked when nodes of the named type are
  encountered.  The set of node types is too extensive to be
  enumerated here; see the
  [Parser API](https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API)
  documentation for a complete list.
  
  A callback is called with one parameter, the Parser API node that
  triggered the callback.  The callback's `this` parameter is set to
  the `AST.AST` object on which `visit` was called (called `ast`
  above).
  
  If a callback returns a truthy value, recursion does not continue
  into descendent nodes of the node that was passed to the callback.
  Otherwise, recursion continues to the bottommost leaf nodes of the
  tree.

  A few callback types that do not directly correspond to Parser API
  node types are available:
  
  - `ObjectLiteral`
  
    This callback is triggered when an `ObjectExpression` node is
    encountered.  However, whereas the `ObjectExpression` callback
    function receives a single node as an argument, an `ObjectLiteral`
    callback function is passed a Javascript object that maps the keys
    of the literal to its value nodes.
    
    For example, consider the Javascript object literal
    `{ foo: 1, "bar": 2 }`.  An `ObjectExpression` callback would be
    given a single node with the following structure:
    
    ```
    {
      type: "ObjectExpression",
      properties: [
        {
          type: "Property",
          key: { type: "Identifier", name: "foo" },
          value: { type: "Literal", value: 1 },
          kind: "init"
        }, {
          type: "Property",
          key: { type: "Literal", value: "bar" },
          value: { type: "Literal", value: 2 },
          kind: "init"
        }
      ]
    }
    ```
    
    An `ObjectLiteral` callback would receive a simplified structure:
    
    ```
    {
      foo: { type: "Literal", value: 1 },
      bar: { type: "Literal", value: 2 }
    }
    ```
    
    If an `ObjectLiteral` callback returns a truthy value, recursion
    does not proceed into any descendent of the `ObjectExpression`
    node.
    
  - `KeyValuePair`
  
    This callback may be called zero or more times whenever an
    `ObjectExpression` node is encountered, one for each property.
    The callback receives two arguments: the key string and the value
    node.  For example, if the object literal in the previous item
    triggered a `KeyValuePair` callback, the callback would be called
    twice, once with the arguments `"foo"` and the `1` literal node,
    and a second time with the arguments `"bar"` and the `2` literal
    node.
    
  - `Variable`
  
    This callback may be called zero or more times when a
    `VariableDeclaration` node is encountered.  Rather than being
    passed a single node, the `Variable` callback receives three
    arguments: the name of the variable, the node representing the
    initial value being given to it, or `null` if no initial value is
    provided, and one of the strings `"var"`, `"let"`, or `"const"`,
    describing the type of declaration.
    
    Destructuring declarations such as `var [a, b, c] = [1, 2, 3]` do
    not trigger the `Variable` callback--only declarations of a simple
    identifier.
    
    Multiple declarations in the same `var`/`let`/`const` cause the
    `Variable` callback to be called for each simple identifier
    declaration.  For example, in the declaration
    
        var [a, b, c] = [1, 2, 3], d = 4, { e: f } = { e: 5 };
        
    ...a `Variable` callback would be called only for the `d = 4`
    declaration.
    
    If a `Variable` callback returns a truthy value, recursion does
    not continue into any child node of the `VariableDeclaration`
    node.
