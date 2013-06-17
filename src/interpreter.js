// $BUILDMARKER$START
/*
 JessieCode Parser and Compiler

    Copyright 2011-2013
        Michael Gerhaeuser,
        Alfred Wassermann

    JessieCode is free software dual licensed under the GNU LGPL or MIT License.

    You can redistribute it and/or modify it under the terms of the

      * GNU Lesser General Public License as published by
        the Free Software Foundation, either version 3 of the License, or
        (at your option) any later version
      OR
      * MIT License: https://github.com/jsxgraph/jsxgraph/blob/master/LICENSE.MIT

    JessieCode is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License and
    the MIT License along with JessieCode. If not, see <http://www.gnu.org/licenses/>
    and <http://opensource.org/licenses/MIT/>.
 */

/*global JXG: true, define: true, window: true, console: true, self: true, document: true, parser: true*/
/*jslint nomen: true, plusplus: true*/

/* depends:
 jxg
 parser/geonext
 base/constants
 base/text
 math/math
 math/geometry
 math/statistics
 utils/type
 utils/uuid
 */

/**
 * @fileoverview JessieCode is a scripting language designed to provide a simple scripting language to build constructions
 * with JSXGraph. It is similar to JavaScript, but prevents access to the DOM. Hence, it can be used in community driven
 * Math portals which want to use JSXGraph to display interactive math graphics.
 */

define([
    'jxg', 'base/constants', 'base/text', 'math/math', 'math/geometry', 'math/statistics', 'utils/type', 'utils/uuid', 'utils/env'
], function (JXG, Const, Text, Mat, Geometry, Statistics, Type, UUID, Env) {

    "use strict";

    /**
     * A JessieCode object provides an interfacce to the parser and stores all variables and objects used within a JessieCode script.
     * The optional argument <tt>code</tt> is interpreted after initializing. To evaluate more code after initializing a JessieCode instance
     * please use {@link JXG.JessieCode#parse}. For code snippets like single expressions use {@link JXG.JessieCode#snippet}.
     * @constructor
     * @param {String} [code] Code to parse.
     * @param {Boolean} [geonext=false] Geonext compatibility mode.
     */
    JXG.JessieCode = function (code, geonext) {
        // Control structures

        /**
         * Stores all variables, local and global. The current scope is determined by {@link JXG.JessieCode#scope}.
         * @type Array
         * @private
         */
        this.sstack = [{}];

        /**
         * Defines the current variable scope.
         * @type Number
         * @private
         */
        this.scope = 0;

        /**
         * A stack used to store the parameter lists for function definitions and calls.
         * @type Array
         * @private
         */
        this.pstack = [[]];

        /**
         * A stack to store debug information (like line and column where it was defined) of a parameter
         * @type Array
         * @private
         */
        this.dpstack = [[]];

        /**
         * Determines the parameter stack scope.
         * @type Number
         * @private
         */
        this.pscope = 0;

        /**
         * Used to store the property-value definition while parsing an object literal.
         * @type Array
         * @private
         */
        this.propstack = [{}];

        /**
         * The current scope of the object literal stack {@link JXG.JessieCode#propstack}.
         * @type Number
         * @private
         */
        this.propscope = 0;

        /**
         * Whenever an element attribute is set via <tt>element.attribute = 'something';</tt>, the element is stored
         * in here, so following attribute changes can be set without the element: <tt>.attribute = 'something else';</tt>.
         * @type JXG.GeometryElement
         * @private
         */
        this.propobj = 0;

        /**
         * Store the left hand side of an assignment. If an element is constructed and no attributes are given, this is
         * used as the element's name.
         * @type Array
         * @private
         */
        this.lhs = [];

        /**
         * lhs flag, used by JXG.JessieCode#replaceNames
         * @type Boolean
         * @default false
         */
        this.isLHS = false;

        /**
         * The id of an HTML node in which innerHTML all warnings are stored (if no <tt>console</tt> object is available).
         * @type String
         * @default 'jcwarn'
         */
        this.warnLog = 'jcwarn';

        /**
         * Store $log messages in case there's no console.
         * @type {Array}
         */
        this.$log = [];

        /**
         * Built-in functions and constants
         * @type Object
         */
        this.builtIn = this.defineBuiltIn();

        /**
         * The board which currently is used to create and look up elements.
         * @type JXG.Board
         */
        this.board = null;

        /**
         * Keep track of which element is created in which line.
         * @type Object
         */
        this.lineToElement = {};

        this.countLines = true;
        this.parCurLine = 1;
        this.parCurColumn = 0;
        this.line = 1;
        this.col = 1;

        this.code = '';

        if (typeof code === 'string') {
            this.parse(code, geonext);
        }
    };


    JXG.extend(JXG.JessieCode.prototype, /** @lends JXG.JessieCode.prototype */ {
        /**
         * Create a new parse tree node.
         * @param {String} type Type of node, e.g. node_op, node_var, or node_const
         * @param value The nodes value, e.g. a variables value or a functions body.
         * @param {Array} children Arbitrary number of child nodes.
         */
        node: function (type, value, children) {
            return {
                type: type,
                value: value,
                children: children
            };
        },

        /**
         * Create a new parse tree node. Basically the same as node(), but this builds
         * the children part out of an arbitrary number of parameters, instead of one
         * array parameter.
         * @param {String} type Type of node, e.g. node_op, node_var, or node_const
         * @param value The nodes value, e.g. a variables value or a functions body.
         * @param children Arbitrary number of parameters; define the child nodes.
         */
        createNode: function (type, value, children) {
            var n = this.node(type, value, []),
                i;

            for (i = 2; i < arguments.length; i++) {
                n.children.push(arguments[i]);
            }

            n.line = this.parCurLine;
            n.col = this.parCurColumn;

            return n;
        },

        /**
         * Looks up an {@link JXG.GeometryElement} by its id.
         * @param {String} id
         * @returns {JXG.GeometryElement}
         */
        getElementById: function (id) {
            return this.board.objects[id];
        },

        log: function () {
            this.$log.push(arguments);

            if (typeof console === 'object' && console.log) {
                console.log.apply(console, arguments);
            }
        },

        /**
         * Returns a element creator function which takes two parameters: the parents array and the attributes object.
         * @param {String} vname The element type, e.g. 'point', 'line', 'midpoint'
         * @returns {function}
         */
        creator: (function () {
            // stores the already defined creators
            var _ccache = {}, r;

            r = function (vname) {
                var f;

                // _ccache is global, i.e. it is the same for ALL JessieCode instances.
                // That's why we need the board id here
                if (typeof _ccache[this.board.id + vname] === 'function') {
                    f =  _ccache[this.board.id + vname];
                } else {
                    f = (function (that) {
                        return function (parameters, attributes) {
                            var attr;

                            if (Type.exists(attributes)) {
                                attr = attributes;
                            } else {
                                attr = {name: (that.lhs[that.scope] !== 0 ? that.lhs[that.scope] : '')};
                            }
                            return that.board.create(vname, parameters, attr);
                        };
                    }(this));

                    f.creator = true;
                    _ccache[this.board.id + vname] = f;
                }

                return f;
            };

            r.clearCache = function () {
                _ccache = {};
            };

            return r;
        }()),

        /**
         * Assigns a value to a variable in the current scope.
         * @param {String} vname Variable name
         * @param value Anything
         * @see JXG.JessieCode#sstack
         * @see JXG.JessieCode#scope
         */
        letvar: function (vname, value) {
            if (this.builtIn[vname]) {
                this._warn('"' + vname + '" is a predefined value.');
            }

            this.sstack[this.scope][vname] = value;
        },

        /**
         * Checks if the given variable name can be found in {@link JXG.JessieCode#sstack}.
         * @param {String} vname
         * @returns {Number} The position in the local variable stack where the variable can be found. <tt>-1</tt> if it couldn't be found.
         */
        isLocalVariable: function (vname) {
            var s;
            for (s = this.scope; s > -1; s--) {
                if (Type.exists(this.sstack[s][vname])) {
                    return s;
                }
            }

            return -1;
        },

        /**
         * Checks if the given variable name is a valid creator method.
         * @param {String} vname
         * @returns {Boolean}
         */
        isCreator: function (vname) {
            // check for an element with this name
            return !!JXG.elements[vname];
        },

        /**
         * Checks if the given variable identifier is a valid member of the JavaScript Math Object.
         * @param {String} vname
         * @returns {Boolean}
         */
        isMathMethod: function (vname) {
            return vname !== 'E' && !!Math[vname];
        },

        /**
         * Returns true if the given identifier is a builtIn variable/function.
         * @param {String} vname
         * @returns {Boolean}
         */
        isBuiltIn: function (vname) {
            return !!this.builtIn[vname];
        },

        /**
         * Looks up the value of the given variable.
         * @param {String} vname Name of the variable
         * @param {Boolean} [local=false] Only look up the internal symbol table and don't look for
         * the <tt>vname</tt> in Math or the element list.
         */
        getvar: function (vname, local) {
            var s, undef;

            local = Type.def(local, false);

            s = this.isLocalVariable(vname);
            if (s > -1) {
                return this.sstack[s][vname];
            }

            // check for an element with this name
            if (this.isCreator(vname)) {
                return this.creator(vname);
            }

            if (this.isMathMethod(vname)) {
                return Math[vname];
            }

            if (this.isBuiltIn(vname)) {
                return this.builtIn[vname];
            }

            if (!local) {
                s = this.board.select(vname);
                if (s !== vname) {
                    return s;
                }
            }

            return undef;
        },

        /**
         * Looks up a variable identifier in various tables and generates JavaScript code that could be eval'd to get the value.
         * @param {String} vname Identifier
         * @param {Boolean} [local=false] Don't resolve ids and names of elements
         * @param {Boolean} [withProps=false]
         */
        getvarJS: function (vname, local, withProps) {
            var s, r = '';

            local = Type.def(local, false);
            withProps = Type.def(withProps, false);

            if (Type.indexOf(this.pstack[this.pscope], vname) > -1) {
                return vname;
            }

            s = this.isLocalVariable(vname);
            if (s > -1 && !withProps) {
                return '$jc$.sstack[' + s + '][\'' + vname + '\']';
            }

            // check for an element with this name
            if (this.isCreator(vname)) {
                return '(function () { var a = Array.prototype.slice.call(arguments, 0), props = ' + (withProps ? 'a.pop()' : '{}') + '; return $jc$.board.create.apply($jc$.board, [\'' + vname + '\'].concat([a, props])); })';
            }

            if (withProps) {
                this._error('Syntax error (attribute values are allowed with element creators only)');
            }

            if (this.isMathMethod(vname)) {
                return 'Math.' + vname;
            }

            if (this.isBuiltIn(vname)) {
                // if src does not exist, it is a number. in that case, just return the value.
                return this.builtIn[vname].src || this.builtIn[vname];
            }

            if (!local) {
                if (Type.isId(this.board, vname)) {
                    r = '$jc$.board.objects[\'' + vname + '\']';
                } else if (Type.isName(this.board, vname)) {
                    r = '$jc$.board.elementsByName[\'' + vname + '\']';
                } else if (Type.isGroup(this.board, vname)) {
                    r = '$jc$.board.groups[\'' + vname + '\']';
                }

                return r;
            }

            return '';
        },

        /**
         * Merge all atribute values given with an element creator into one object.
         * @param {Object} o An arbitrary number of objects
         * @returns {Object} All given objects merged into one. If properties appear in more (case sensitive) than one
         * object the last value is taken.
         */
        mergeAttributes: function (o) {
            var i, attr = {};

            for (i = 0; i < arguments.length; i++) {
                attr = Type.deepCopy(attr, arguments[i], true);
            }

            return attr;
        },

        /**
         * Sets the property <tt>what</tt> of {@link JXG.JessieCode#propobj} to <tt>value</tt>
         * @param {JXG.Point|JXG.Text} o
         * @param {String} what
         * @param value
         */
        setProp: function (o, what, value) {
            var par = {}, x, y;

            if (o.elementClass === Const.OBJECT_CLASS_POINT && (what === 'X' || what === 'Y')) {
                // set coords

                what = what.toLowerCase();

                // be advised, we've spotted three cases in your AO:
                // o.isDraggable && typeof value === number:
                //   stay draggable, just set the new coords (e.g. via moveTo)
                // o.isDraggable && typeof value === function:
                //   convert to !o.isDraggable, set the new coords via o.addConstraint()
                // !o.isDraggable:
                //   stay !o.isDraggable, update the given coord by overwriting X/YEval

                if (o.isDraggable && typeof value === 'number') {
                    x = what === 'x' ? value : o.X();
                    y = what === 'y' ? value : o.Y();

                    o.setPosition(Const.COORDS_BY_USER, [x, y]);
                } else if (o.isDraggable && (typeof value === 'function' || typeof value === 'string')) {
                    x = what === 'x' ? value : o.coords.usrCoords[1];
                    y = what === 'y' ? value : o.coords.usrCoords[2];

                    o.addConstraint([x, y]);
                } else if (!o.isDraggable) {
                    x = what === 'x' ? value : o.XEval.origin;
                    y = what === 'y' ? value : o.YEval.origin;

                    o.addConstraint([x, y]);
                }

                this.board.update();
            } else if (o.type === Const.OBJECT_TYPE_TEXT && (what === 'X' || what === 'Y')) {
                if (typeof value === 'number') {
                    o[what] = function () { return value; };
                } else if (typeof value === 'function') {
                    o.isDraggable = false;
                    o[what] = value;
                } else if (typeof value === 'string') {
                    o.isDraggable = false;
                    o[what] = Type.createFunction(value, this.board, null, true);
                    o[what + 'jc'] = value;
                }

                o[what].origin = value;

                this.board.update();
            } else if (o.type && o.elementClass && o.visProp) {
                par[what] = value;
                o.setProperty(par);
            } else {
                o[what] = value;
            }
        },

        /**
         * Encode characters outside the ASCII table into HTML Entities, because JavaScript or JS/CC can't handle a RegEx
         * applied to a string with unicode characters.
         * @param {String} string
         * @returns {String}
         */
        utf8_encode : function (string) {
            var utftext = [], n, c;

            for (n = 0; n < string.length; n++) {
                c = string.charCodeAt(n);

                if (c < 128) {
                    utftext.push(String.fromCharCode(c));
                } else {
                    utftext.push('&#x' + c.toString(16) + ';');
                }
            }

            return utftext.join('');
        },

        /**
         * Parses JessieCode
         * @param {String} code
         * @param {Boolean} [geonext=false] Geonext compatibility mode.
         * @param {Boolean} dontstore
         */
        parse: function (code, geonext, dontstore) {
            var i, setTextBackup, ast,
                ccode = code.replace(/\r\n/g, '\n').split('\n'),
                cleaned = [];

            if (!dontstore) {
                this.code += code + '\n';
            }

            if (Text) {
                setTextBackup = Text.Text.prototype.setText;
                Text.Text.prototype.setText = Text.Text.prototype.setTextJessieCode;
            }

            try {
                if (!Type.exists(geonext)) {
                    geonext = false;
                }

                for (i = 0; i < ccode.length; i++) {
                    if (geonext) {
                        ccode[i] = JXG.GeonextParser.geonext2JS(ccode[i], this.board);
                    }

                    cleaned.push(ccode[i]);
                }
                code = cleaned.join('\n');
                code = this.utf8_encode(code);

                console.log(code);
                ast = parser.parse(code);
                console.log(ast);
                this.execute(ast);
            } finally {
                // make sure the original text method is back in place
                if (Text) {
                    Text.Text.prototype.setText = setTextBackup;
                }
            }
        },

        /**
         * Parses a JessieCode snippet, e.g. "3+4", and wraps it into a function, if desired.
         * @param {String} code A small snippet of JessieCode. Must not be an assignment.
         * @param {Boolean} funwrap If true, the code is wrapped in a function.
         * @param {String} varname Name of the parameter(s)
         * @param {Boolean} [geonext=false] Geonext compatibility mode.
         */
        snippet: function (code, funwrap, varname, geonext) {
            var vname, c, tmp, result;
console.log(code, new Error().stack);
            vname = 'jxg__tmp__intern_' + UUID.genUUID().replace(/\-/g, '');

            if (!Type.exists(funwrap)) {
                funwrap = true;
            }

            if (!Type.exists(varname)) {
                varname = '';
            }

            if (!Type.exists(geonext)) {
                geonext = false;
            }

            // just in case...
            tmp = this.sstack[0][vname];

            this.countLines = false;

            c = vname + ' = ' + (funwrap ? ' function (' + varname + ') { return ' : '') + code + (funwrap ? '; }' : '') + ';';
            this.parse(c, geonext, true);

            result = this.sstack[0][vname];
            if (Type.exists(tmp)) {
                this.sstack[0][vname] = tmp;
            } else {
                delete this.sstack[0][vname];
            }

            this.countLines = true;

            return result;
        },

        /**
         * Traverses through the given subtree and changes all values of nodes with the replaced flag set by
         * {@link JXG.JessieCode#replaceNames} to the name of the element (if not empty).
         * @param {Object} node
         */
        replaceIDs: function (node) {
            var i, v;

            if (node.replaced) {
                // these children exist, if node.replaced is set.
                v = this.board.objects[node.children[1].children[0].value];

                if (Type.exists(v) && v.name !== "") {
                    node.type = 'node_var';
                    node.value = v.name;

                    // maybe it's not necessary, but just to be sure that everything is cleaned up we better delete all
                    // children and the replaced flag
                    node.children.length = 0;
                    delete node.replaced;
                }
            }

            if (node.children) {
                // assignments are first evaluated on the right hand side
                for (i = node.children.length; i > 0; i--) {
                    if (Type.exists(node.children[i - 1])) {
                        node.children[i - 1] = this.replaceIDs(node.children[i - 1]);
                    }

                }
            }

            return node;
        },

        /**
         * Traverses through the given subtree and changes all elements referenced by names through referencing them by ID.
         * An identifier is only replaced if it is not found in all scopes above the current scope and if it
         * has not been blacklisted within the codeblock determined by the given subtree.
         * @param {Object} node
         */
        replaceNames: function (node) {
            var i, v;

            v = node.value;

            // we are interested only in nodes of type node_var and node_op > op_lhs.
            // currently, we are not checking if the id is a local variable. in this case, we're stuck anyway.

            if (node.type === 'node_op' && v === 'op_lhs' && node.children.length === 1) {
                this.isLHS = true;
            } else if (node.type === 'node_var') {
                if (this.isLHS) {
                    this.letvar(v, true);
                } else if (!Type.exists(this.getvar(v, true)) && Type.exists(this.board.elementsByName[v])) {
                    node = this.createReplacementNode(node);
                }
            }

            if (node.children) {
                // assignments are first evaluated on the right hand side
                for (i = node.children.length; i > 0; i--) {
                    if (Type.exists(node.children[i - 1])) {
                        node.children[i - 1] = this.replaceNames(node.children[i - 1]);
                    }
                }
            }

            if (node.type === 'node_op' && node.value === 'op_lhs' && node.children.length === 1) {
                this.isLHS = false;
            }

            return node;
        },

        /**
         * Replaces node_var nodes with node_op&gt;op_execfun nodes, calling the internal $() function with the id of the
         * element accessed by the node_var node.
         * @param {Object} node
         * @returns {Object} op_execfun node
         */
        createReplacementNode: function (node) {
            var v = node.value,
                el = this.board.elementsByName[v];

            node = this.createNode('node_op', 'op_execfun',
                this.createNode('node_var', '$'),
                this.createNode('node_op', 'op_param', this.createNode('node_str', el.id)));

            node.replaced = true;

            return node;
        },

        /**
         * Search the parse tree below <tt>node</tt> for <em>stationary</em> dependencies, i.e. dependencies hard coded into
         * the function.
         * @param {Object} node
         * @param {Object} result An object where the referenced elements will be stored. Access key is their id.
         */
        collectDependencies: function (node, result) {
            var i, v, e;

            v = node.value;

            if (node.type === 'node_var') {
                e = this.getvar(v);
                if (e && e.visProp && e.type && e.elementClass && e.id) {
                    result[e.id] = e;
                }
            }

            // the $()-function-calls are special because their parameter is given as a string, not as a node_var.
            if (node.type === 'node_op' && node.value === 'op_execfun' && node.children.length > 1 && node.children[0].value === '$' && node.children[1].children.length > 0) {
                e = node.children[1].children[0].value;
                result[e] = this.board.objects[e];
            }

            if (node.children) {
                for (i = node.children.length; i > 0; i--) {
                    if (Type.exists(node.children[i - 1])) {
                        this.collectDependencies(node.children[i - 1], result);
                    }

                }
            }
        },

        resolveProperty: function (e, v, compile) {
            compile = Type.def(compile, false);

            // is it a geometry element or a board?
            if (e /*&& e.type && e.elementClass*/ && e.methodMap) {
                // yeah, it is. but what does the user want?
                if (Type.exists(e.subs) && Type.exists(e.subs[v])) {
                    // a subelement it is, good sir.
                    e = e.subs;
                } else if (Type.exists(e.methodMap[v])) {
                    // the user wants to call a method
                    v = e.methodMap[v];
                } else {
                    // the user wants to change an attribute
                    e = e.visProp;
                    v = v.toLowerCase();
                }
            }

            if (!Type.exists(e)) {
                this._error(e + ' is not an object');
            }

            if (!Type.exists(e[v])) {
                this._error('unknown property ' + v);
            }

            if (compile && typeof e[v] === 'function') {
                return function () { return e[v].apply(e, arguments); };
            }

            return e[v];
        },

        /**
         * Resolves the lefthand side of an assignment operation
         * @param node
         * @returns {Object} An object with two properties. <strong>o</strong> which contains the object, and
         * a string <strong>what</strong> which contains the property name.
         */
        getLHS: function (node) {
            var res;

            if (node.type === 'node_var') {
                res = {
                    o: this.sstack[this.scope],
                    what: node.value
                };
            } else if (node.type === 'node_op' && node.value === 'op_property') {
                res = {
                    o: this.execute(node.children[0]),
                    what: node.children[1]
                };
            } else if (node.type === 'node_op' && node.value === 'op_extvalue') {
                res = {
                    o: this.execute(node.children[0]),
                    what: this.execute(node.children[1])
                };
            } else {
                throw new Error('Syntax error: Invalid left-hand side of assignment.');
            }

            return res;
        },

        /**
         * Executes a parse subtree.
         * @param {Object} node
         * @returns {Number|String|Object|Boolean} Something
         * @private
         */
        execute: function (node) {
            var ret, v, i, e, l, undef, list, ilist,
                parents = [],
                // exec fun
                fun, attr, sc,
                // op_use
                b,
                found = false;

            ret = 0;

            if (!node) {
                return ret;
            }

            this.line = node.line;
            this.col = node.col;

            switch (node.type) {
            case 'node_op':
                switch (node.value) {
                case 'op_none':
                    if (node.children[0]) {
                        this.execute(node.children[0]);
                    }
                    if (node.children[1]) {
                        ret = this.execute(node.children[1]);
                    }
                    break;
                case 'op_assign':
                    console.log('op_assign', node);
                    v = this.getLHS(node.children[0]);


                    //v = this.execute(node.children[0]);
                    console.log(v);
                    this.lhs[this.scope] = v[1];

                    if (v.o.type && v.o.elementClass && v.o.methodMap && v.what === 'label') {
                        this._error('Left-hand side of assignment is read-only.');
                    }

                    if (v.o !== this.sstack[this.scope] || (Type.isArray(v.o) && typeof v.what === 'number')) {
                        // it is either an array component being set or a property of an object.
                        this.setProp(v.o, v.what, this.execute(node.children[1]));
                    } else {
                        // this is just a local variable inside JessieCode
                        this.letvar(v.what, this.execute(node.children[1]));
                    }

                    this.lhs[this.scope] = 0;
                    break;
                case 'op_if':
                    if (this.execute(node.children[0])) {
                        ret = this.execute(node.children[1]);
                    }
                    break;
                case 'op_conditional':
                    // fall through
                case 'op_if_else':
                    if (this.execute(node.children[0])) {
                        ret = this.execute(node.children[1]);
                    } else {
                        ret = this.execute(node.children[2]);
                    }
                    break;
                case 'op_while':
                    while (this.execute(node.children[0])) {
                        this.execute(node.children[1]);
                    }
                    break;
                case 'op_do':
                    do {
                        this.execute(node.children[0]);
                    } while (this.execute(node.children[1]));
                    break;
                case 'op_for':
                    for (this.execute(node.children[0]); this.execute(node.children[1]); this.execute(node.children[2])) {
                        this.execute(node.children[3]);
                    }
                    break;
                case 'op_param':
                    if (node.children[1]) {
                        this.execute(node.children[1]);
                    }

                    ret = node.children[0];
                    this.pstack[this.pscope].push(ret);
                    if (this.dpstack[this.pscope]) {
                        this.dpstack[this.pscope].push({
                            line: node.children[0].line,
                            col: node.children[0].col
                        });
                    }
                    break;
                case 'op_paramdef':
                    if (node.children[1]) {
                        this.execute(node.children[1]);
                    }

                    ret = node.children[0];
                    this.pstack[this.pscope].push(ret);
                    break;
                case 'op_proplst':
                    if (node.children[0]) {
                        this.execute(node.children[0]);
                    }
                    if (node.children[1]) {
                        this.execute(node.children[1]);
                    }
                    break;
                case 'op_emptyobject':
                    ret = {};
                    break;
                case 'op_proplst_val':
                    this.propstack.push({});
                    this.propscope++;
console.log('proplst', node);
                    this.execute(node.children[0]);
                    ret = this.propstack[this.propscope];

                    this.propstack.pop();
                    this.propscope--;
                    break;
                case 'op_prop':
                    // child 0: Identifier
                    // child 1: Value
                    this.propstack[this.propscope][node.children[0]] = this.execute(node.children[1]);
                    break;
                case 'op_array':
                    this.pstack.push([]);
                    this.pscope++;

                    this.execute(node.children[0]);

                    ret = [];
                    l = this.pstack[this.pscope].length;

                    for (i = 0; i < l; i++) {
                        ret.push(this.execute(this.pstack[this.pscope][i]));
                    }

                    this.pstack.pop();
                    this.pscope--;

                    break;
                case 'op_extvalue':
                    ret = this.execute(node.children[0]);
                    i = this.execute(node.children[1]);

                    if (typeof i === 'number' && Math.abs(Math.round(i) - i) < Mat.eps) {
                        ret = ret[i];
                    } else {
                        ret = undef;
                    }
                    break;
                case 'op_return':
                    if (this.scope === 0) {
                        this._error('Unexpected return.');
                    } else {
                        return this.execute(node.children[0]);
                    }
                    break;
                case 'op_function':
                    this.pstack.push([]);
                    this.pscope++;

                    // parse the parameter list
                    // after this, the parameters are in pstack
                    this.execute(node.children[0]);

                    if (this.board.options.jc.compile) {
                        this.sstack.push({});
                        this.scope++;

                        this.isLHS = false;

                        for (i = 0; i < this.pstack[this.pscope].length; i++) {
                            this.sstack[this.scope][this.pstack[this.pscope][i]] = this.pstack[this.pscope][i];
                        }

                        this.replaceNames(node.children[1]);

                        fun = (function ($jc$) {
                            var fun,
                                p = $jc$.pstack[$jc$.pscope].join(', '),
                                str = 'var f = function (' + p + ') {\n$jc$.sstack.push([]);\n$jc$.scope++;\nvar r = (function () ' + $jc$.compile(node.children[1], true) + ')();\n$jc$.sstack.pop();\n$jc$.scope--;\nreturn r;\n}; f;';
                            // the function code formatted:
                            /*
                             var f = function (_parameters_) {
                                 // handle the stack
                                 $jc$.sstack.push([]);
                                 $jc$.scope++;

                                 // this is required for stack handling: usually at some point in a function
                                 // there's a return statement, that prevents the cleanup of the stack.
                                 var r = (function () {
                                     _compiledcode_;
                                })();

                                 // clean up the stack
                                 $jc$.sstack.pop();
                                 $jc$.scope--;

                                 // return the result
                                 return r;
                             };
                             f;   // the return value of eval()
                             */

                            try {
                                // yeah, eval is evil, but we don't have much choice here.
                                // the str is well defined and there is no user input in it that we didn't check before

                                /*jslint evil:true*/
                                fun = eval(str);
                                /*jslint evil:false*/

                                return fun;
                            } catch (e) {
                                return function () {};
                            }
                        }(this));

                        // clean up scope
                        this.sstack.pop();
                        this.scope--;
                    } else {
                        fun = (function (_pstack, that) {
                            return function () {
                                var r;

                                that.sstack.push({});
                                that.scope++;
                                for (r = 0; r < _pstack.length; r++) {
                                    that.sstack[that.scope][_pstack[r]] = arguments[r];
                                }

                                r = that.execute(node.children[1]);

                                that.sstack.pop();
                                that.scope--;
                                return r;
                            };
                        }(this.pstack[this.pscope], this));
                    }

                    fun.node = node;
                    fun.toJS = fun.toString;
                    fun.toString = (function (_that) {
                        return function () {
                            return _that.compile(_that.replaceIDs(Type.deepCopy(node)));
                        };
                    }(this));

                    fun.deps = {};
                    this.collectDependencies(node.children[1], fun.deps);

                    this.pstack.pop();
                    this.pscope--;

                    ret = fun;
                    break;
                case 'op_execfun':
                    // node.children:
                    //   [0]: Name of the function
                    //   [1]: Parameter list as a parse subtree
                    //   [2]: Properties, only used in case of a create function
                    this.pstack.push([]);
                    this.dpstack.push([]);
                    this.pscope++;

                    list = node.children[1];
console.log('Function Call!', node.children[0], node.children[1], node.children[2]);

                    // parse the properties only if given
                    if (Type.exists(node.children[2])) {
                        if (node.children[3]) {
                            ilist = node.children[2];
                            attr = {};

                            for (i = 0; i < ilist.length; i++) {
                                attr = Type.deepCopy(attr, this.execute(ilist[i]), true);
                            }
                        } else {
                            attr = this.execute(node.children[2]);
                        }
                    }

                    // look up the variables name in the variable table
                    fun = this.execute(node.children[0]);

                    // determine the scope the function wants to run in
                    if (fun && fun.sc) {
                        sc = fun.sc;
                    } else {
                        sc = this;
                    }

                    if (!fun.creator && Type.exists(node.children[2])) {
                        this._error('Unexpected value. Only element creators are allowed to have a value after the function call.');
                    }

                    // interpret ALL the parameters
                    for (i = 0; i < list.length; i++) {
                        parents[i] = this.execute(list[i]);
                    }
                    // check for the function in the variable table
                    if (typeof fun === 'function' && !fun.creator) {
                        ret = fun.apply(sc, parents);
                    } else if (typeof fun === 'function' && !!fun.creator) {
                        e = this.line;
console.log('CREATOR FUN', node)
                        // creator methods are the only ones that take properties, hence this special case
                        try {
                            ret = fun(parents, attr);
                            ret.jcLineStart = e;
                            ret.jcLineEnd = node.line;

                            for (i = e; i <= node.line; i++) {
                                this.lineToElement[i] = ret;
                            }

                            ret.debugParents = this.dpstack[this.pscope];
                        } catch (ex) {
                            this._error(ex.toString());
                        }
                    } else {
                        this._error('Function \'' + fun + '\' is undefined.');
                    }

                    // clear parameter stack
                    this.pstack.pop();
                    this.dpstack.pop();
                    this.pscope--;
                    break;
                case 'op_property':
                    e = this.execute(node.children[0]);
                    v = node.children[1];

                    ret = this.resolveProperty(e, v, false);

                    // set the scope, in case this is a method the user wants to call
                    if (Type.exists(ret)) {
                        ret.sc = e;
                    }

                    break;
                case 'op_lhs':
                    v = node.children[0];

                    // we have a subtree here (in case this is an array component)
                    if (v.children && v.type && v.value) {
                        v = this.execute(v);
                    }

                    if (node.children.length === 1) {
                        e = this.sstack[this.scope];
                    } else {
                        e = this.execute(node.children[1]);

                        if (e.type && e.elementClass && v.toLowerCase && v.toLowerCase() !== 'x' && v.toLowerCase() !== 'y') {
                            v = v.toLowerCase();
                        }
                    }

                    ret = [e, v];
                    break;
                case 'op_use':
                    // node.children:
                    //   [0]: A string providing the id of the div the board is in.
                    found = false;

                    // search all the boards for the one with the appropriate container div
                    for (b in JXG.boards) {
                        if (JXG.boards.hasOwnProperty(b) && JXG.boards[b].container === node.children[0].toString()) {
                            this.use(JXG.boards[b]);
                            found = true;
                        }
                    }

                    if (!found) {
                        this._error('Board \'' + node.children[0].toString() + '\' not found!');
                    }

                    break;
                case 'op_delete':
                    v = this.getvar(node.children[0]);

                    if (typeof v === 'object' && JXG.exists(v.type) && JXG.exists(v.elementClass)) {
                        this.board.removeObject(v);
                    }
                    break;
                case 'op_equ':
                    // == is intentional
                    /*jslint eqeq:true*/
                    ret = this.execute(node.children[0]) == this.execute(node.children[1]);
                    /*jslint eqeq:false*/
                    break;
                case 'op_neq':
                    // != is intentional
                    /*jslint eqeq:true*/
                    ret = this.execute(node.children[0]) != this.execute(node.children[1]);
                    /*jslint eqeq:true*/
                    break;
                case 'op_approx':
                    ret = Math.abs(this.execute(node.children[0]) - this.execute(node.children[1])) < Mat.eps;
                    break;
                case 'op_grt':
                    ret = this.execute(node.children[0]) > this.execute(node.children[1]);
                    break;
                case 'op_lot':
                    ret = this.execute(node.children[0]) < this.execute(node.children[1]);
                    break;
                case 'op_gre':
                    ret = this.execute(node.children[0]) >= this.execute(node.children[1]);
                    break;
                case 'op_loe':
                    ret = this.execute(node.children[0]) <= this.execute(node.children[1]);
                    break;
                case 'op_or':
                    ret = this.execute(node.children[0]) || this.execute(node.children[1]);
                    break;
                case 'op_and':
                    ret = this.execute(node.children[0]) && this.execute(node.children[1]);
                    break;
                case 'op_not':
                    ret = !this.execute(node.children[0]);
                    break;
                case 'op_add':
                    ret = Statistics.add(this.execute(node.children[0]), this.execute(node.children[1]));
                    break;
                case 'op_sub':
                    ret = Statistics.subtract(this.execute(node.children[0]), this.execute(node.children[1]));
                    break;
                case 'op_div':
                    ret = Statistics.div(this.execute(node.children[0]), this.execute(node.children[1]));
                    break;
                case 'op_mod':
                    // use mathematical modulo, JavaScript implements the symmetric modulo.
                    ret = Statistics.mod(this.execute(node.children[0]), this.execute(node.children[1]), true);
                    break;
                case 'op_mul':
                    ret = this.mul(this.execute(node.children[0]), this.execute(node.children[1]));
                    break;
                case 'op_exp':
                    ret = this.pow(this.execute(node.children[0]),  this.execute(node.children[1]));
                    break;
                case 'op_neg':
                    ret = this.execute(node.children[0]) * -1;
                    break;
                }
                break;

            case 'node_var':
                ret = this.getvar(node.value);
                break;

            case 'node_const':
                ret = Number(node.value);
                break;

            case 'node_const_bool':
                ret = node.value;
                break;

            case 'node_str':
                ret = node.value;
                break;
            }

            return ret;
        },

        /**
         * Compiles a parse tree back to JessieCode.
         * @param {Object} node
         * @param {Boolean} [js=false] Currently ignored. Compile either to JavaScript or back to JessieCode (required for the UI).
         * @returns Something
         * @private
         */
        compile: function (node, js) {
            var e, i, list,
                ret = '';

            if (!Type.exists(js)) {
                js = false;
            }

            if (!node) {
                return ret;
            }

            switch (node.type) {
            case 'node_op':
                switch (node.value) {
                case 'op_none':
                    if (node.children[0]) {
                        ret = this.compile(node.children[0], js);
                    }
                    if (node.children[1]) {
                        ret += this.compile(node.children[1], js);
                    }
                    break;
                case 'op_assign':
                    e = this.compile(node.children[0], js);
                    if (js) {
                        if (Type.isArray(e)) {
                            ret = '$jc$.setProp(' + e[0] + ', \'' + e[1] + '\', ' + this.compile(node.children[1], js) + ');\n';
                        } else {
                            if (this.isLocalVariable(e) !== this.scope) {
                                this.sstack[this.scope][e] = true;
                            }
                            ret = '$jc$.sstack[' + this.scope + '][\'' + e + '\'] = ' + this.compile(node.children[1], js) + ';\n';
                        }
                    } else {
                        ret = e + ' = ' + this.compile(node.children[1], js) + ';\n';
                    }

                    break;
                case 'op_if':
                    ret = ' if (' + this.compile(node.children[0], js) + ') ' + this.compile(node.children[1], js);
                    break;
                case 'op_if_else':
                    ret = ' if (' + this.compile(node.children[0], js) + ')' + this.compile(node.children[1], js);
                    ret += ' else ' + this.compile(node.children[2], js);
                    break;
                case 'op_conditional':
                    ret = '((' + this.compile(node.children[0], js) + ')?(' + this.compile(node.children[1], js);
                    ret += '):(' + this.compile(node.children[2], js) + '))';
                    break;
                case 'op_while':
                    ret = ' while (' + this.compile(node.children[0], js) + ') {\n' + this.compile(node.children[1], js) + '}\n';
                    break;
                case 'op_do':
                    ret = ' do {\n' + this.compile(node.children[0], js) + '} while (' + this.compile(node.children[1], js) + ');\n';
                    break;
                case 'op_for':
                    ret = ' for (' + this.compile(node.children[0], js) + '; ' + this.compile(node.children[1], js) + '; ' + this.compile(node.children[2], js) + ') {\n' + this.compile(node.children[3], js) + '\n}\n';
                    break;
                case 'op_param':
                    if (node.children[1]) {
                        ret = this.compile(node.children[1], js) + ', ';
                    }

                    ret += this.compile(node.children[0], js);
                    break;
                case 'op_paramdef':
                    if (node.children[1]) {
                        ret = this.compile(node.children[1], js) + ', ';
                    }

                    ret += node.children[0];
                    break;
                case 'op_proplst':
                    if (node.children[0]) {
                        ret = this.compile(node.children[0], js) + ', ';
                    }

                    ret += this.compile(node.children[1], js);
                    break;
                case 'op_prop':
                    // child 0: Identifier
                    // child 1: Value
                    ret = node.children[0] + ': ' + this.compile(node.children[1], js);
                    break;
                case 'op_emptyobject':
                    ret = js ? '{}' : '<< >>';
                    break;
                case 'op_proplst_val':
                    ret = this.compile(node.children[0], js);
                    break;
                case 'op_array':
                    ret = '[' + this.compile(node.children[0], js) + ']';
                    break;
                case 'op_extvalue':
                    ret = this.compile(node.children[0], js) + '[' + this.compile(node.children[1], js) + ']';
                    break;
                case 'op_return':
                    ret = ' return ' + this.compile(node.children[0], js) + ';\n';
                    break;
                case 'op_function':
                    ret = ' function (' + this.compile(node.children[0], js) + ') ' + this.compile(node.children[1], js);
                    break;
                case 'op_execfun':
                    // parse the properties only if given
                    if (node.children[2]) {
                        list = [];
                        for (i = 0; i < node.children[2].length; i++) {
                            list.push(this.compile(node.children[2][i], js));
                        }

                        if (js) {
                            e = '$jc$.mergeAttributes(' + list.join(', ') + ')';
                        }
                    }
                    node.children[0].withProps = !!node.children[2];
                    list = [];
                    for (i = 0; i < node.children[1].length; i++) {
                        list.push(this.compile(node.children[1][i], js));
                    }
                    ret = this.compile(node.children[0], js) + '(' + list.join(', ') + (node.children[2] && js ? ', ' + e : '') + ')' + (node.children[2] && !js ? e : '');

                    // save us a function call when compiled to javascript
                    if (js && node.children[0].value === '$') {
                        ret = '$jc$.board.objects[' + this.compile(node.children[1], js) + ']';
                    }

                    break;
                case 'op_property':
                    if (js && node.children[1] !== 'X' && node.children[1] !== 'Y') {
                        ret = '$jc$.resolveProperty(' + this.compile(node.children[0], js) + ', \'' + node.children[1] + '\', true)';
                    } else {
                        ret = this.compile(node.children[0], js) + '.' + node.children[1];
                    }
                    break;
                case 'op_lhs':
                    if (node.children.length === 1) {
                        ret = node.children[0];
                    } else if (node.children[2] === 'dot') {
                        if (js) {
                            ret = [this.compile(node.children[1], js), node.children[0]];
                        } else {
                            ret = this.compile(node.children[1], js) + '.' + node.children[0];
                        }
                    } else if (node.children[2] === 'bracket') {
                        if (js) {
                            ret = [this.compile(node.children[1], js), this.compile(node.children[0], js)];
                        } else {
                            ret = this.compile(node.children[1], js) + '[' + this.compile(node.children[0], js) + ']';
                        }
                    }
                    break;
                case 'op_use':
                    if (js) {
                        ret = '$jc$.use(JXG.boards[\'' + node.children[0] + '\'])';
                    } else {
                        ret = 'use ' + node.children[0] + ';';
                    }
                    break;
                case 'op_delete':
                    ret = 'delete ' + node.children[0];
                    break;
                case 'op_equ':
                    ret = '(' + this.compile(node.children[0], js) + ' == ' + this.compile(node.children[1], js) + ')';
                    break;
                case 'op_neq':
                    ret = '(' + this.compile(node.children[0], js) + ' != ' + this.compile(node.children[1], js) + ')';
                    break;
                case 'op_approx':
                    ret = '(' + this.compile(node.children[0], js) + ' ~= ' + this.compile(node.children[1], js) + ')';
                    break;
                case 'op_grt':
                    ret = '(' + this.compile(node.children[0], js) + ' > ' + this.compile(node.children[1], js) + ')';
                    break;
                case 'op_lot':
                    ret = '(' + this.compile(node.children[0], js) + ' < ' + this.compile(node.children[1], js) + ')';
                    break;
                case 'op_gre':
                    ret = '(' + this.compile(node.children[0], js) + ' >= ' + this.compile(node.children[1], js) + ')';
                    break;
                case 'op_loe':
                    ret = '(' + this.compile(node.children[0], js) + ' <= ' + this.compile(node.children[1], js) + ')';
                    break;
                case 'op_or':
                    ret = '(' + this.compile(node.children[0], js) + ' || ' + this.compile(node.children[1], js) + ')';
                    break;
                case 'op_and':
                    ret = '(' + this.compile(node.children[0], js) + ' && ' + this.compile(node.children[1], js) + ')';
                    break;
                case 'op_not':
                    ret = '!(' + this.compile(node.children[0], js) + ')';
                    break;
                case 'op_add':
                    if (js) {
                        ret = 'JXG.Math.Statistics.add(' + this.compile(node.children[0], js) + ', ' + this.compile(node.children[1], js) + ')';
                    } else {
                        ret = '(' + this.compile(node.children[0], js) + ' + ' + this.compile(node.children[1], js) + ')';
                    }
                    break;
                case 'op_sub':
                    if (js) {
                        ret = 'JXG.Math.Statistics.subtract(' + this.compile(node.children[0], js) + ', ' + this.compile(node.children[1], js) + ')';
                    } else {
                        ret = '(' + this.compile(node.children[0], js) + ' - ' + this.compile(node.children[1], js) + ')';
                    }
                    break;
                case 'op_div':
                    if (js) {
                        ret = 'JXG.Math.Statistics.div(' + this.compile(node.children[0], js) + ', ' + this.compile(node.children[1], js) + ')';
                    } else {
                        ret = '(' + this.compile(node.children[0], js) + ' / ' + this.compile(node.children[1], js) + ')';
                    }
                    break;
                case 'op_mod':
                    if (js) {
                        ret = 'JXG.Math.mod(' + this.compile(node.children[0], js) + ', ' + this.compile(node.children[1], js) + ', true)';
                    } else {
                        ret = '(' + this.compile(node.children[0], js) + ' % ' + this.compile(node.children[1], js) + ')';
                    }
                    break;
                case 'op_mul':
                    if (js) {
                        ret = '$jc$.mul(' + this.compile(node.children[0], js) + ', ' + this.compile(node.children[1], js) + ')';
                    } else {
                        ret = '(' + this.compile(node.children[0], js) + ' * ' + this.compile(node.children[1], js) + ')';
                    }
                    break;
                case 'op_exp':
                    if (js) {
                        ret = '$jc$.pow(' + this.compile(node.children[0], js) + ', ' + this.compile(node.children[1], js) + ')';
                    } else {
                        ret = '(' + this.compile(node.children[0], js) + '^' + this.compile(node.children[1], js) + ')';
                    }
                    break;
                case 'op_neg':
                    ret = '(-' + this.compile(node.children[0], js) + ')';
                    break;
                }
                break;

            case 'node_var':
                if (js) {
                    ret = this.getvarJS(node.value, false, node.withProps);
                } else {
                    ret = node.value;
                }
                break;

            case 'node_const':
                ret = node.value;
                break;

            case 'node_const_bool':
                ret = node.value;
                break;

            case 'node_str':
                ret = '\'' + node.value.replace(/'/g, '\\\'') + '\'';
                break;
            }

            if (node.needsBrackets) {
                ret = '{\n' + ret + '}\n';
            }

            return ret;
        },

        /**
         * This is used as the global X() function.
         * @param {JXG.Point|JXG.Text} e
         * @returns {Number}
         */
        X: function (e) {
            return e.X();
        },

        /**
         * This is used as the global Y() function.
         * @param {JXG.Point|JXG.Text} e
         * @returns {Number}
         */
        Y: function (e) {
            return e.Y();
        },

        /**
         * This is used as the global V() function.
         * @param {Glider|Slider} e
         * @returns {Number}
         */
        V: function (e) {
            return e.Value();
        },

        /**
         * This is used as the global L() function.
         * @param {JXG.Line} e
         * @returns {Number}
         */
        L: function (e) {
            return e.L();
        },

        /**
         * This is used as the global dist() function.
         * @param {JXG.Point} p1
         * @param {JXG.Point} p2
         * @returns {Number}
         */
        dist: function (p1, p2) {
            if (!Type.exists(p1) || !Type.exists(p1.Dist)) {
                this._error('Error: Can\'t calculate distance.');
            }

            return p1.Dist(p2);
        },

        /**
         * Multiplication of vectors and numbers
         * @param {Number|Array} a
         * @param {Number|Array} b
         * @returns {Number|Array} (Inner) product of the given input values.
         */
        mul: function (a, b) {
            if (Type.isArray(a) * Type.isArray(b)) {
                return Mat.innerProduct(a, b, Math.min(a.length, b.length));
            }

            return Statistics.multiply(a, b);
        },

        /**
         * Pow function wrapper to allow direct usage of sliders.
         * @param {Number|Slider} a
         * @param {Number|Slider} b
         * @returns {Number}
         */
        pow: function (a, b) {
            a = Type.evalSlider(a);
            b = Type.evalSlider(b);

            return Math.pow(a, b);
        },

        ifthen: function (cond, v1, v2) {
            if (cond) {
                return v1;
            }

            return v2;
        },

        use: function (board) {
            this.board = board;
            this.builtIn.$board = board;
            this.builtIn.$board.src = '$jc$.board';
        },

        /**
         * Find the first symbol to the given value from the given scope upwards.
         * @param v Value
         * @param {Number} [scope=-1] The scope, default is to start with current scope (-1).
         * @returns {Array} An array containing the symbol and the scope if a symbol could be found,
         * an empty array otherwise;
         */
        findSymbol: function (v, scope) {
            var s, i;

            scope = Type.def(scope, -1);

            if (scope === -1) {
                scope = this.scope;
            }

            for (s = scope; s >= 0; s--) {
                for (i in this.sstack[s]) {
                    if (this.sstack[s].hasOwnProperty(i) && this.sstack[s][i] === v) {
                        return [i, s];
                    }
                }
            }

            return [];
        },

        /**
         * Defines built in methods and constants.
         * @returns {Object} BuiltIn control object
         */
        defineBuiltIn: function () {
            var that = this,
                builtIn = {
                    PI: Math.PI,
                    EULER: Math.E,
                    X: that.X,
                    Y: that.Y,
                    V: that.V,
                    L: that.L,
                    dist: that.dist,
                    rad: Geometry.rad,
                    deg: Geometry.trueAngle,
                    factorial: Mat.factorial,
                    trunc: Type.trunc,
                    IfThen: that.ifthen,
                    '$': that.getElementById,
                    '$board': that.board,
                    '$log': that.log
                };

            // special scopes for factorial, deg, and rad
            builtIn.rad.sc = Geometry;
            builtIn.deg.sc = Geometry;
            builtIn.factorial.sc = Mat;

            // set the javascript equivalent for the builtIns
            // some of the anonymous functions should be replaced by global methods later on
            // EULER and PI don't get a source attribute - they will be lost anyways and apparently
            // some browser will throw an exception when a property is assigned to a primitive value.
            builtIn.X.src = '$jc$.X';
            builtIn.Y.src = '$jc$.Y';
            builtIn.V.src = '$jc$.V';
            builtIn.L.src = '$jc$.L';
            builtIn.dist.src = '$jc$.dist';
            builtIn.rad.src = 'JXG.Math.Geometry.rad';
            builtIn.deg.src = 'JXG.Math.Geometry.trueAngle';
            builtIn.factorial.src = 'JXG.Math.factorial';
            builtIn.trunc.src = 'JXG.trunc';
            builtIn.IfThen.src = '$jc$.ifthen';
            // usually unused, see node_op > op_execfun
            builtIn.$.src = '(function (n) { return $jc$.board.select(n); })';
            if (builtIn.$board) {
                builtIn.$board.src = '$jc$.board';
            }
            builtIn.$log.src = '$jc$.log';

            return builtIn;
        },

        /**
         * Output a debugging message. Uses debug console, if available. Otherwise an HTML element with the
         * id "debug" and an innerHTML property is used.
         * @param {String} log
         * @private
         */
        _debug: function (log) {
            if (typeof console === 'object') {
                console.log(log);
            } else if (Env.isBrowser && document && document.getElementById('debug') !== null) {
                document.getElementById('debug').innerHTML += log + '<br />';
            }
        },

        /**
         * Throws an exception with the given error message.
         * @param {String} msg Error message
         */
        _error: function (msg) {
            var e = new Error('Error(' + this.line + '): ' + msg);
            e.line = this.line;
            throw e;
        },

        /**
         * Output a warning message using {@link JXG#debug} and precedes the message with "Warning: ".
         * @param {String} msg
         */
        _warn: function (msg) {
            if (typeof console === 'object') {
                console.log('Warning(' + this.line + '): ' + msg);
            } else if (Env.isBrowser && document && document.getElementById(this.warnLog) !== null) {
                document.getElementById(this.warnLog).innerHTML += 'Warning(' + this.line + '): ' + msg + '<br />';
            }
        },

        _log: function (msg) {
            if (typeof window !== 'object' && typeof self === 'object' && self.postMessage) {
                self.postMessage({type: 'log', msg: 'Log: ' + msg.toString()});
            } else {
                console.log('Log: ', arguments);
            }
        }

    });

    // $BUILDMARKER$END
});