(function() {
    "use strict";

    var diffcount;

    var Diff = function(options) {
        var diff = this;
        Object.keys(options).forEach(function(option) {
            diff[option] = options[option];
        });
    };

    Diff.prototype = {
        toString: function() {
            return JSON.stringify(this);
        }

        // TODO: compress diff output by replacing these keys with numbers or alike:
        /*        'addAttribute' = 0,
                'modifyAttribute' = 1,
                'removeAttribute' = 2,
                'modifyTextElement' = 3,
                'relocateGroup' = 4,
                'removeElement' = 5,
                'addElement' = 6,
                'removeTextElement' = 7,
                'addTextElement' = 8,
                'replaceElement' = 9,
                'modifyValue' = 10,
                'modifyChecked' = 11,
                'modifySelected' = 12,
                'modifyComment' = 13,
                'action' = 14,
                'route' = 15,
                'oldValue' = 16,
                'newValue' = 17,
                'element' = 18,
                'group' = 19,
                'from' = 20,
                'to' = 21,
                'name' = 22,
                'value' = 23,
                'data' = 24,
                'attributes' = 25,
                'nodeName' = 26,
                'childNodes' = 27,
                'checked' = 28,
                'selected' = 29;*/
    };

    var SubsetMapping = function SubsetMapping(a, b) {
        this.old = a;
        this.new = b;
    };

    SubsetMapping.prototype = {
        contains: function contains(subset) {
            if (subset.length < this.length) {
                return subset.new >= this.new && subset.new < this.new + this.length;
            }
            return false;
        },
        toString: function toString() {
            return this.length + " element subset, first mapping: old " + this.old + " → new " + this.new;
        }
    };

    var elementDescriptors = function(el) {
        var output = [];
        if (el.nodeName != '#text' && el.nodeName != '#comment') {
            output.push(el.nodeName);
            if (el.attributes) {
                if (el.attributes.class) {
                    output.push(el.nodeName + '.' + el.attributes.class.replace(/ /g, '.'));
                }
                if (el.attributes.id) {
                    output.push(el.nodeName + '#' + el.attributes.id);
                }
            }

        }
        return output;
    };

    var findUniqueDescriptors = function(li) {
        var uniqueDescriptors = {},
            duplicateDescriptors = {};

        li.forEach(function(node) {
            elementDescriptors(node).forEach(function(descriptor) {
                var inUnique = descriptor in uniqueDescriptors,
                    inDupes = descriptor in duplicateDescriptors;
                if (!inUnique && !inDupes) {
                    uniqueDescriptors[descriptor] = true;
                } else if (inUnique) {
                    delete uniqueDescriptors[descriptor];
                    duplicateDescriptors[descriptor] = true;
                }
            });

        });

        return uniqueDescriptors;
    };

    var uniqueInBoth = function(l1, l2) {
        var l1Unique = findUniqueDescriptors(l1),
            l2Unique = findUniqueDescriptors(l2),
            inBoth = {};

        Object.keys(l1Unique).forEach(function(key) {
            if (l2Unique[key]) {
                inBoth[key] = true;
            }
        });

        return inBoth;
    };

    var removeDone = function(tree) {
        delete tree.outerDone;
        delete tree.innerDone;
        delete tree.valueDone;
        if (tree.childNodes) {
            return tree.childNodes.every(removeDone);
        } else {
            return true;
        }
    };

    var isEqual = function(e1, e2) {

        var e1Attributes, e2Attributes, attribute;

        if (!['nodeName', 'value', 'checked', 'selected', 'data'].every(function(element) {
                if (e1[element] !== e2[element]) {
                    return false;
                }
                return true;
            })) {
            return false;
        }

        if (Boolean(e1.attributes) !== Boolean(e2.attributes)) {
            return false;
        }

        if (Boolean(e1.childNodes) !== Boolean(e2.childNodes)) {
            return false;
        }

        if (e1.attributes) {
            e1Attributes = Object.keys(e1.attributes);
            e2Attributes = Object.keys(e2.attributes);

            if (e1Attributes.length != e2Attributes.length) {
                return false;
            }
            if (!e1Attributes.every(function(attribute){
              if (e1.attributes[attribute] !== e2.attributes[attribute]) {
                  return false;
              }
            })) {
                return false;
            };
        }

        if (e1.childNodes) {
            if (e1.childNodes.length !== e2.childNodes.length) {
                return false;
            }
            if (!e1.childNodes.every(function(childNode, index) {
                    return isEqual(childNode, e2.childNodes[index]);
                })) {

                return false;
            }

        }

        return true;

    };


    var roughlyEqual = function(e1, e2, uniqueDescriptors, sameSiblings, preventRecursion) {
        var childUniqueDescriptors, nodeList1, nodeList2;

        if (!e1 || !e2) {
            return false;
        }

        if (e1.nodeName !== e2.nodeName) {
            return false;
        }

        if (e1.nodeName === '#text') {
            // Note that we initially don't care what the text content of a node is,
            // the mere fact that it's the same tag and "has text" means it's roughly
            // equal, and then we can find out the true text difference later.
            return preventRecursion ? true : e1.data === e2.data;
        }


        if (e1.nodeName in uniqueDescriptors) {
            return true;
        }

        if (e1.attributes && e2.attributes) {

            if (e1.attributes.id && e1.attributes.id === e2.attributes.id) {
                var idDescriptor = e1.nodeName + '#' + e1.attributes.id;
                if (idDescriptor in uniqueDescriptors) {
                    return true;
                }
            }
            if (e1.attributes.class && e1.attributes.class === e2.attributes.class) {
                var classDescriptor = e1.nodeName + '.' + e1.attributes.class.replace(/ /g, '.');
                if (classDescriptor in uniqueDescriptors) {
                    return true;
                }
            }
        }

        if (sameSiblings) {
            return true;
        }

        nodeList1 = e1.childNodes ? e1.childNodes.slice().reverse() : [];
        nodeList2 = e2.childNodes ? e2.childNodes.slice().reverse() : [];

        if (nodeList1.length !== nodeList2.length) {
            return false;
        }

        if (preventRecursion) {
            return nodeList1.every(function(element, index) {
                return element.nodeName === nodeList2[index].nodeName;
            });
        } else {
            // note: we only allow one level of recursion at any depth. If 'preventRecursion'
            // was not set, we must explicitly force it to true for child iterations.
            childUniqueDescriptors = uniqueInBoth(nodeList1, nodeList2);
            return nodeList1.every(function(element, index) {
                return roughlyEqual(element, nodeList2[index], childUniqueDescriptors, true, true);
            });
        }
    };


    var cloneObj = function(obj) {
        // 'to'DO: Do we really need to clone here? Is it not enough to just return the original object?
        return JSON.parse(JSON.stringify(obj));
        //return obj;
    };

    var nodeToObj = function(node) {
        var objNode = {};
        objNode.nodeName = node.nodeName;
        if (objNode.nodeName === '#text' || objNode.nodeName === '#comment') {
            objNode.data = node.data;
        } else {
            if (node.attributes && node.attributes.length > 0) {
                objNode.attributes = {};
                Array.prototype.slice.call(node.attributes).forEach(
                    function(attribute) {
                        objNode.attributes[attribute.name] = attribute.value;
                    }
                );
            }
            if (node.childNodes && node.childNodes.length > 0) {
                objNode.childNodes = [];
                Array.prototype.slice.call(node.childNodes).forEach(
                    function(childNode) {
                        objNode.childNodes.push(nodeToObj(childNode));
                    }
                );
            }
            if (node.value) {
                objNode.value = node.value;
            }
            if (node.checked) {
                objNode.checked = node.checked;
            }
            if (node.selected) {
                objNode.selected = node.selected;
            }
        }

        return objNode;
    };


    var objToNode = function(objNode, insideSvg) {
        var node;
        if (objNode.nodeName === '#text') {
            node = document.createTextNode(objNode.data);

        } else if (objNode.nodeName === '#comment') {
            node = document.createComment(objNode.data);
        } else {
            if (objNode.nodeName === 'svg' || insideSvg) {
                node = document.createElementNS('http://www.w3.org/2000/svg', objNode.nodeName);
                insideSvg = true;
            } else {
                node = document.createElement(objNode.nodeName);
            }
            if (objNode.attributes) {
                Object.keys(objNode.attributes).forEach(function(attribute) {
                    node.setAttribute(attribute, objNode.attributes[attribute]);
                });
            }
            if (objNode.childNodes) {
                objNode.childNodes.forEach(function(childNode) {
                    node.appendChild(objToNode(childNode, insideSvg));
                });
            }
            if (objNode.value) {
                node.value = objNode.value;
            }
            if (objNode.checked) {
                node.checked = objNode.checked;
            }
            if (objNode.selected) {
                node.selected = objNode.selected;
            }
        }
        return node;
    };



    /**
     * based on https://en.wikibooks.org/wiki/Algorithm_implementation/Strings/Longest_common_substring#JavaScript
     */
    var findCommonSubsets = function(c1, c2, marked1, marked2) {
        var lcsSize = 0,
            index = [],
            matches = Array.apply(null, new Array(c1.length + 1)).map(function() {
                return [];
            }), // set up the matching table
            uniqueDescriptors = uniqueInBoth(c1, c2),
            // If all of the elements are the same tag, id and class, then we can
            // consider them roughly the same even if they have a different number of
            // children. This will reduce removing and re-adding similar elements.
            subsetsSame = c1.length === c2.length,
            origin, ret;

        if (subsetsSame) {

            c1.some(function(element, i) {
                var c1Desc = elementDescriptors(element),
                    c2Desc = elementDescriptors(c2[i]);
                if (c1Desc.length !== c2Desc.length) {
                    subsetsSame = false;
                    return true;
                }
                c1Desc.some(function(description, i) {
                    if (description !== c2Desc[i]) {
                        subsetsSame = false;
                        return true;
                    }
                });
                if (!subsetsSame) {
                    return true;
                }

            });
        }

        // fill the matches with distance values
        c1.forEach(function(c1Element, c1Index) {
            c2.forEach(function(c2Element, c2Index) {
                if (!marked1[c1Index] && !marked2[c2Index] && roughlyEqual(c1Element, c2Element, uniqueDescriptors, subsetsSame)) {
                    matches[c1Index + 1][c2Index + 1] = (matches[c1Index][c2Index] ? matches[c1Index][c2Index] + 1 : 1);
                    if (matches[c1Index + 1][c2Index + 1] > lcsSize) {
                        lcsSize = matches[c1Index + 1][c2Index + 1];
                        index = [c1Index + 1, c2Index + 1];
                    }
                } else {
                    matches[c1Index + 1][c2Index + 1] = 0;
                }
            });
        });

        if (lcsSize === 0) {
            return false;
        }
        origin = [index[0] - lcsSize, index[1] - lcsSize];
        ret = new SubsetMapping(origin[0], origin[1]);
        ret.length = lcsSize;
        return ret;
    };

    /**
     * This should really be a predefined function in Array...
     */
    var makeArray = function(n, v) {
        return Array.apply(null, new Array(n)).map(function() {
            return v;
        });
    };

    /**
     * Generate arrays that indicate which node belongs to which subset,
     * or whether it's actually an orphan node, existing in only one
     * of the two trees, rather than somewhere in both.
     */
    var getGapInformation = function(t1, t2, stable) {

        var gaps1 = t1.childNodes ? makeArray(t1.childNodes.length, true) : [],
            gaps2 = t2.childNodes ? makeArray(t2.childNodes.length, true) : [],
            group = 0;

        // give elements from the same subset the same group number
        stable.forEach(function(subset) {
            var i, endOld = subset.old + subset.length,
                endNew = subset.new + subset.length;
            for (i = subset.old; i < endOld; i += 1) {
                gaps1[i] = group;
            }
            for (i = subset.new; i < endNew; i += 1) {
                gaps2[i] = group;
            }
            group += 1;
        });

        return {
            gaps1: gaps1,
            gaps2: gaps2
        };
    };

    /**
     * Find all matching subsets, based on immediate child differences only.
     */
    var markSubTrees = function(oldTree, newTree) {
        // note: the child lists are views, and so update as we update old/newTree
        var oldChildren = oldTree.childNodes ? oldTree.childNodes : [],
            newChildren = newTree.childNodes ? newTree.childNodes : [],
            marked1 = makeArray(oldChildren.length, false),
            marked2 = makeArray(newChildren.length, false),
            subsets = [],
            subset = true,
            returnIndex = function() {
                return arguments[1];
            },
            markBoth = function(i) {
                marked1[subset.old + i] = true;
                marked2[subset.new + i] = true;
            };

        while (subset) {
            subset = findCommonSubsets(oldChildren, newChildren, marked1, marked2);
            if (subset) {
                subsets.push(subset);

                Array.apply(null, new Array(subset.length)).map(returnIndex).forEach(markBoth);

            }
        }
        return subsets;
    };


    function swap(obj, p1, p2) {
        (function(_) {
            obj[p1] = obj[p2];
            obj[p2] = _;
        }(obj[p1]));
    }


    var DiffTracker = function() {
        this.list = [];
    };

    DiffTracker.prototype = {
        list: false,
        add: function(diffs) {
            var list = this.list;
            diffs.forEach(function(diff) {
                list.push(diff);
            });
        },
        forEach: function(fn) {
            this.list.forEach(fn);
        }
    };

    var diffDOM = function(options) {

        var defaults = {
                debug: false,
                diffcap: 10,
                valueDiffing: true, // Whether to take into consideration the values of forms that differ from auto assigned values (when a user fills out a form).
                // syntax: textDiff: function (node, currentValue, expectedValue, newValue)
                textDiff: function() {
                    arguments[0].data = arguments[3];
                    return;
                }
            },
            i;

        if (typeof options == "undefined") {
            options = {};
        }

        for (i in defaults) {
            if (typeof options[i] == "undefined") {
                this[i] = defaults[i];
            } else {
                this[i] = options[i];
            }
        }

    };
    diffDOM.prototype = {

        // ===== Create a diff =====

        diff: function(t1Node, t2Node) {

            var t1 = nodeToObj(t1Node),
                t2 = nodeToObj(t2Node);

            diffcount = 0;

            if (this.debug) {
                this.t1Orig = nodeToObj(t1Node);
                this.t2Orig = nodeToObj(t2Node);
            }

            this.tracker = new DiffTracker();
            return this.findDiffs(t1, t2);
        },
        findDiffs: function(t1, t2) {
            var diffs;
            do {
                if (this.debug) {
                    diffcount += 1;
                    if (diffcount > this.diffcap) {
                        window.diffError = [this.t1Orig, this.t2Orig];
                        throw new Error("surpassed diffcap:" + JSON.stringify(this.t1Orig) + " -> " + JSON.stringify(this.t2Orig));
                    }
                }
                diffs = this.findNextDiff(t1, t2, []);
                if (diffs.length === 0 || !diffs) {
                    // Last check if the elements really are the same now.
                    // If not, remove all info about being done and start over.
                    // Somtimes a node can be marked as done, but the creation of subsequent diffs means that it has to be changed anyway.
                    if (!isEqual(t1, t2)) {
                        removeDone(t1);
                      diffs = this.findNextDiff(t1, t2, []);
                    }
                }

                if (diffs.length > 0) {
                    this.tracker.add(diffs);
                    this.applyVirtual(t1, diffs);
                }
            } while (diffs);
            return this.tracker.list;
        },
        findNextDiff: function(t1, t2, route) {
            var diffs;

            // outer differences?
            if (!t1.outerDone) {
                diffs = this.findOuterDiff(t1, t2, route);
                if (diffs.length > 0) {
                    t1.outerDone = true;
                    return diffs;
                } else {
                    t1.outerDone = true;
                }
            }
            // inner differences?
            if (!t1.innerDone) {
                diffs = this.findInnerDiff(t1, t2, route);
                if (diffs.length > 0) {
                    return diffs;
                } else {
                    t1.innerDone = true;
                }
            }

            if (this.valueDiffing && !t1.valueDone) {
                // value differences?
                diffs = this.findValueDiff(t1, t2, route);

                if (diffs.length > 0) {
                    t1.valueDone = true;
                    return diffs;
                } else {
                    t1.valueDone = true;
                }
            }

            // no differences
            return false;
        },
        findOuterDiff: function(t1, t2, route) {

            var diffs = [], attr1, attr2;

            if (t1.nodeName !== t2.nodeName) {
                return [new Diff({
                    action: 'replaceElement',
                    oldValue: cloneObj(t1),
                    newValue: cloneObj(t2),
                    route: route
                })];
            }

            if (t1.data !== t2.data) {
                // Comment or text node.
                if (t1.nodeName === '#text') {
                  return [new Diff({
                      action: 'modifyComment',
                      route: route,
                      oldValue: t1.data,
                      newValue: t2.data
                  })];
                } else {
                  return [new Diff({
                      action: 'modifyTextElement',
                      route: route,
                      oldValue: t1.data,
                      newValue: t2.data
                  })];
                }

            }


            attr1 = t1.attributes ? Object.keys(t1.attributes).sort() : [];
            attr2 = t2.attributes ? Object.keys(t2.attributes).sort() : [];

            attr1.forEach(function(attr) {
                var pos = attr2.indexOf(attr);
                if (pos === -1) {
                    diffs.push(new Diff({
                        action: 'removeAttribute',
                        route: route,
                        name: attr,
                        value: t1.attributes[attr]
                    }));
                } else {
                    attr2.splice(pos, 1);
                    if (t1.attributes[attr] !== t2.attributes[attr]) {
                        diffs.push(new Diff({
                            action: 'modifyAttribute',
                            route: route,
                            name: attr,
                            oldValue: t1.attributes[attr],
                            newValue: t2.attributes[attr]
                        }));
                    }
                }

            });


            attr2.forEach(function(attr) {
                diffs.push(new Diff({
                    action: 'addAttribute',
                    route: route,
                    name: attr,
                    value: t2.attributes[attr]
                }));

            });

            return diffs;
        },
        findInnerDiff: function(t1, t2, route) {

            var subtrees = markSubTrees(t1, t2),
                mappings = subtrees.length,
                t1_child_nodes = t1.childNodes ? t1.childNodes : [],
                t2_child_nodes = t2.childNodes ? t2.childNodes : [],
                diffs, i, last, e1, e2;

            // no correspondence whatsoever
            // if t1 or t2 contain differences that are not text nodes, return a diff.

            // two text nodes with differences
            if (mappings === 0) {
                if (t1.nodeName === '#text' && t2.nodeName === '#text' && t1.data !== t2.data) {
                    return [new Diff({
                        action: 'modiFyTextElement',
                        oldValue: t1.data,
                        newValue: t2.data,
                        route: route
                    })];
                }
            }
            // possibly identical content: verify
            if (mappings < 2) {
                last = Math.max(t1_child_nodes.length, t2_child_nodes.length);
                for (i = 0; i < last; i += 1) {
                    e1 = t1_child_nodes[i];
                    e2 = t2_child_nodes[i];
                    // TODO: This is a similar code path to the one
                    //       in findFirstInnerDiff. Can we unify these?
                    if (e1 && !e2) {
                        if (e1.nodeName === '#text') {
                            return [new Diff({
                                action: 'removeTextElement',
                                route: route.concat(i),
                                value: e1.data
                            })];
                        }
                        return [new Diff({
                            action: 'removeElement',
                            route: route.concat(i),
                            element: cloneObj(e1)
                        })];
                    }
                    if (e2 && !e1) {
                        if (e2.nodeName === '#text') {
                            return [new Diff({
                                action: 'addTextElement',
                                route: route.concat(i),
                                value: e2.data
                            })];
                        }
                        return [new Diff({
                            action: 'addElement',
                            route: route.concat(i),
                            element: cloneObj(e2)
                        })];
                    }

                    diffs = this.findNextDiff(e1, e2, route.concat(i));
                    if (diffs && diffs.length > 0) {
                        return diffs;
                    }

                }
            }

            // one or more differences: find first diff
            return this.findFirstInnerDiff(t1, t2, subtrees, route);
        },

        findValueDiff: function(t1, t2, route) {
            // Differences of value. Only useful if the value/selection/checked value
            // differs from what is represented in the DOM. For example in the case
            // of filled out forms, etc.
            var diffs = [];

            if (t1.selected !== t2.selected) {
                diffs.push(new Diff({
                    action: 'modifySelected',
                    oldValue: t1.selected,
                    newValue: t2.selected,
                    route: route
                }));
            }

            if ((t1.value || t2.value) && t1.value !== t2.value && t1.nodeName !== 'OPTION') {
                diffs.push(new Diff({
                    action: 'modifyValue',
                    oldValue: t1.value,
                    newValue: t2.value,
                    route: route
                }));
            }
            if (t1.checked !== t2.checked) {
                diffs.push(new Diff({
                    action: 'modifyChecked',
                    oldValue: t1.checked,
                    newValue: t2.checked,
                    route: route
                }));
            }

            return diffs;
        },


        findFirstInnerDiff: function(t1, t2, subtrees, route) {
            if (subtrees.length === 0) {
                return [];
            }

            var gapInformation = getGapInformation(t1, t2, subtrees),
                gaps1 = gapInformation.gaps1,
                gl1 = gaps1.length,
                gaps2 = gapInformation.gaps2,
                gl2 = gaps1.length,
                destinationDifferent, toGroup,
                i, j;

            // Check for correct submap sequencing (irrespective of gaps) first:
            var group, node, similarNode, testI, shortest = gl1 < gl2 ? gaps1 : gaps2;

            // group relocation
            for (i = 0; i < shortest.length; i += 1) {
                if (gaps1[i] === true) {
                    node = t1.childNodes[i];
                    if (node.nodeName === '#text') {
                        if (t2.childNodes[i].nodeName === '#text' && node.data !== t2.childNodes[i].data) {
                            testI = i;
                            while (t1.childNodes.length > testI + 1 && t1.childNodes[testI + 1].nodeName === '#text') {
                                testI += 1;
                                if (t2.childNodes[i].data === t1.childNodes[testI].data) {
                                    similarNode = true;
                                    break;
                                }
                            }
                            if (!similarNode) {
                                return [new Diff({
                                    action: 'modifyTextElement',
                                    route: route.concat(i),
                                    oldValue: node.data,
                                    newValue: t2.childNodes[i].data
                                })];
                            }
                        }
                        return [new Diff({
                            action: 'removeTextElement',
                            route: route.concat(i),
                            value: node.data
                        })];
                    }
                    return [new Diff({
                        action: 'removeElement',
                        route: route.concat(i),
                        element: cloneObj(node)
                    })];
                }
                if (gaps2[i] === true) {
                    node = t2.childNodes[i];
                    if (node.nodeName === '#text') {
                        return [new Diff({
                            action: 'addTextElement',
                            route: route.concat(i),
                            value: node.data
                        })];
                    }
                    return [new Diff({
                        action: 'addElement',
                        route: route.concat(i),
                        element: cloneObj(node)
                    })];
                }
                if (gaps1[i] !== gaps2[i]) {
                    group = subtrees[gaps1[i]];
                    toGroup = Math.min(group.new, (t1.childNodes.length - group.length));
                    if (toGroup !== i) {
                        // Check whether destination nodes are different than originating ones.
                        destinationDifferent = false;
                        for (j = 0; j < group.length; j += 1) {
                            if (!roughlyEqual(t1.childNodes[toGroup + j], t1.childNodes[i + j], [], false, true)) {
                                destinationDifferent = true;
                            }
                        }
                        if (destinationDifferent) {
                            return [new Diff({
                                action: 'relocateGroup',
                                group: group,
                                from: i,
                                to: toGroup,
                                route: route
                            })];
                        }
                    }
                }
            }
            return [];
        },
        // ===== Apply a virtual diff =====

        applyVirtual: function(tree, diffs) {
            var dobj = this;
            if (diffs.length === 0) {
                return true;
            }
            diffs.forEach(function(diff) {
                //              console.log(JSON.stringify(diff));
                //              console.log(JSON.stringify(tree));
                //              console.log(objToNode(tree).outerHTML);
                if (!dobj.applyVirtualDiff(tree, diff)) {
                    return false;
                }
                //                console.log(JSON.stringify(tree));
                //                console.log(objToNode(tree).outerHTML);
            });
            return true;
        },
        getFromVirtualRoute: function(tree, route) {
            route = route.slice();
            var c, node = tree,
                parentNode, nodeIndex;
            while (route.length > 0) {
                if (!node.childNodes) {
                    return false;
                }
                c = route.splice(0, 1)[0];
                parentNode = node;
                node = node.childNodes[c];
                nodeIndex = c;
            }
            return {
                node: node,
                parentNode: parentNode,
                nodeIndex: nodeIndex
            };
        },
        applyVirtualDiff: function(tree, diff) {
            var routeInfo = this.getFromVirtualRoute(tree, diff.route),
                node = routeInfo.node,
                parentNode = routeInfo.parentNode,
                nodeIndex = routeInfo.nodeIndex,
                newNode, route, group, from, to, c, i;

            switch (diff.action) {
                case 'addAttribute':
                    if (!node.attributes) {
                        node.attributes = {};
                    }

                    node.attributes[diff.name] = diff.value;

                    if (diff.name === 'checked') {
                        node.checked = true;
                    } else if (diff.name === 'selected') {
                        node.selected = true;
                    } else if (node.nodeName === 'INPUT' && diff.name === 'value') {
                        node.value = diff.value;
                    }

                    break;
                case 'modifyAttribute':
                    node.attributes[diff.name] = diff.newValue;
                    if (node.nodeName === 'INPUT' && diff.name === 'value') {
                        node.value = diff.value;
                    }
                    break;
                case 'removeAttribute':

                    delete node.attributes[diff.name];

                    if (Object.keys(node.attributes).length === 0) {
                        delete node.attributes;
                    }

                    if (diff.name === 'checked') {
                        delete node.checked;
                    } else if (diff.name === 'selected') {
                        delete node.selected;
                    } else if (node.nodeName === 'INPUT' && diff.name === 'value') {
                        delete node.value;
                    }

                    break;
                case 'modifyTextElement':
                    node.data = diff.newValue;

                    if (parentNode.nodeName === 'TEXTAREA') {
                        parentNode.value = diff.newValue;
                    }
                    break;
                case 'modifyValue':
                    node.value = diff.newValue;
                    break;
                case 'modifyComment':
                    node.data = diff.newValue;
                    break;
                case 'modifyChecked':
                    node.checked = diff.newValue;
                    break;
                case 'modifySelected':
                    node.selected = diff.newValue;
                    break;
                case 'replaceElement':
                    newNode = cloneObj(diff.newValue);
                    newNode.outerDone = true;
                    newNode.innerDone = true;
                    newNode.valueDone = true;
                    parentNode.childNodes[nodeIndex] = newNode;
                    break;
                case 'relocateGroup':
                    group = diff.group;
                    from = diff.from;
                    to = diff.to;
                    if (from < to) {
                        for (i = 0; i < group.length; i += 1) {
                            newNode = node.childNodes.splice(from, 1)[0];
                            node.childNodes.splice((to + group.length - 1), 0, newNode);
                        }
                    } else {
                        for (i = 0; i < group.length; i += 1) {
                            node.childNodes.splice((to + i), 0, node.childNodes.splice((from + i), 1)[0]);
                        }
                    }
                    break;
                case 'removeElement':
                    parentNode.childNodes.splice(nodeIndex, 1);
                    break;
                case 'addElement':
                    route = diff.route.slice();
                    c = route.splice(route.length - 1, 1)[0];
                    node = this.getFromVirtualRoute(tree, route).node;
                    newNode = cloneObj(diff.element);
                    newNode.outerDone = true;
                    newNode.innerDone = true;
                    newNode.valueDone = true;

                    if (!node.childNodes) {
                        node.childNodes = [];
                    }

                    if (c >= node.childNodes.length) {
                        node.childNodes.push(newNode);
                    } else {
                        node.childNodes.splice(c, 0, newNode);
                    }
                    break;
                case 'removeTextElement':
                    parentNode.childNodes.splice(nodeIndex, 1);
                    if (parentNode.nodeName === 'TEXTAREA') {
                        delete parentNode.value;
                    }
                    break;
                case 'addTextElement':
                    route = diff.route.slice();
                    c = route.splice(route.length - 1, 1)[0];
                    newNode = {};
                    newNode.nodeName = '#text';
                    newNode.data = diff.value;
                    node = this.getFromVirtualRoute(tree, route).node;
                    if (!node.childNodes) {
                        node.childNodes = [];
                    }

                    if (c >= node.childNodes.length) {
                        node.childNodes.push(newNode);
                    } else {
                        node.childNodes.splice(c, 0, newNode);
                    }
                    if (node.nodeName === 'TEXTAREA') {
                        node.value = diff.newValue;
                    }
                    break;
                default:
                    console.log('unknown action');
            }

            return true;
        },




        // ===== Apply a diff =====

        apply: function(tree, diffs) {
            var dobj = this;

            if (diffs.length === 0) {
                return true;
            }
            diffs.forEach(function(diff) {
                if (!dobj.applyDiff(tree, diff)) {
                    return false;
                }
            });
            return true;
        },
        getFromRoute: function(tree, route) {
            route = route.slice();
            var c, node = tree;
            while (route.length > 0) {
                if (!node.childNodes) {
                    return false;
                }
                c = route.splice(0, 1)[0];
                node = node.childNodes[c];
            }
            return node;
        },
        applyDiff: function(tree, diff) {
            var node = this.getFromRoute(tree, diff.route),
                newNode, reference, route, group, from, to, child, c, i;

            switch (diff.action) {
                case 'addAttribute':
                    if (!node || !node.setAttribute) {
                        return false;
                    }
                    node.setAttribute(diff.name, diff.value);
                    break;
                case 'modifyAttribute':
                    if (!node || !node.setAttribute) {
                        return false;
                    }
                    node.setAttribute(diff.name, diff.newValue);
                    break;
                case 'removeAttribute':
                    if (!node || !node.removeAttribute) {
                        return false;
                    }
                    node.removeAttribute(diff.name);
                    break;
                case 'modifyTextElement':
                    if (!node || node.nodeType !== 3) {
                        return false;
                    }
                    this.textDiff(node, node.data, diff.oldValue, diff.newValue);
                    break;
                case 'modifyValue':
                    if (!node || typeof node.value === 'undefined') {
                        return false;
                    }
                    node.value = diff.newValue;
                    break;
                case 'modifyComment':
                    if (!node || typeof node.data === 'undefined') {
                        return false;
                    }
                    node.data = diff.newValue;
                    break;
                case 'modifyChecked':
                    if (!node || typeof node.checked === 'undefined') {
                        return false;
                    }
                    node.checked = diff.newValue;
                    break;
                case 'modifySelected':
                    if (!node || typeof node.selected === 'undefined') {
                        return false;
                    }
                    node.selected = diff.newValue;
                    break;
                case 'replaceElement':
                    newNode = objToNode(diff.newValue);
                    node.parentNode.replaceChild(newNode, node);
                    break;
                case 'relocateGroup':
                    group = diff.group;
                    from = diff.from;
                    to = diff.to;
                    reference = node.childNodes[to + group.length];
                    // slide elements up
                    if (from < to) {
                        for (i = 0; i < group.length; i += 1) {
                            child = node.childNodes[from];
                            node.insertBefore(child, reference);
                        }
                    } else {
                        // slide elements down
                        reference = node.childNodes[to];
                        for (i = 0; i < group.length; i += 1) {
                            child = node.childNodes[from + i];
                            node.insertBefore(child, reference);
                        }
                    }
                    break;
                case 'removeElement':
                    node.parentNode.removeChild(node);
                    break;
                case 'addElement':
                    route = diff.route.slice();
                    c = route.splice(route.length - 1, 1)[0];
                    node = this.getFromRoute(tree, route);
                    newNode = objToNode(diff.element);
                    if (c >= node.childNodes.length) {
                        node.appendChild(newNode);
                    } else {
                        reference = node.childNodes[c];
                        node.insertBefore(newNode, reference);
                    }
                    break;
                case 'removeTextElement':
                    if (!node || node.nodeType !== 3) {
                        return false;
                    }
                    node.parentNode.removeChild(node);
                    break;
                case 'addTextElement':
                    route = diff.route.slice();
                    c = route.splice(route.length - 1, 1)[0];
                    newNode = document.createTextNode(diff.value);
                    node = this.getFromRoute(tree, route);
                    if (!node || !node.childNodes) {
                        return false;
                    }
                    if (c >= node.childNodes.length) {
                        node.appendChild(newNode);
                    } else {
                        reference = node.childNodes[c];
                        node.insertBefore(newNode, reference);
                    }
                    break;
                default:
                    console.log('unknown action');
            }

            return true;
        },

        // ===== Undo a diff =====

        undo: function(tree, diffs) {
            diffs = diffs.slice();
            var dobj = this;
            if (!diffs.length) {
                diffs = [diffs];
            }
            diffs.reverse();
            diffs.forEach(function(diff) {
                dobj.undoDiff(tree, diff);
            });
        },
        undoDiff: function(tree, diff) {

            switch (diff.action) {
                case 'addAttribute':
                    diff.action = 'removeAttribute';
                    this.applyDiff(tree, diff);
                    break;
                case 'modifyAttribute':
                    swap(diff, 'oldValue', 'newValue');
                    this.applyDiff(tree, diff);
                    break;
                case 'removeAttribute':
                    diff.action = 'addAttribute';
                    this.applyDiff(tree, diff);
                    break;
                case 'modifyTextElement':
                    swap(diff, 'oldValue', 'newValue');
                    this.applyDiff(tree, diff);
                    break;
                case 'modifyValue':
                    swap(diff, 'oldValue', 'newValue');
                    this.applyDiff(tree, diff);
                    break;
                case 'modifyComment':
                    swap(diff, 'oldValue', 'newValue');
                    this.applyDiff(tree, diff);
                    break;
                case 'modifyChecked':
                    swap(diff, 'oldValue', 'newValue');
                    this.applyDiff(tree, diff);
                    break;
                case 'modifySelected':
                    swap(diff, 'oldValue', 'newValue');
                    this.applyDiff(tree, diff);
                    break;
                case 'replaceElement':
                    swap(diff, 'oldValue', 'newValue');
                    this.applyDiff(tree, diff);
                    break;
                case 'relocateGroup':
                    swap(diff, 'from', 'to');
                    this.applyDiff(tree, diff);
                    break;
                case 'removeElement':
                    diff.action = 'addElement';
                    this.applyDiff(tree, diff);
                    break;
                case 'addElement':
                    diff.action = 'removeElement';
                    this.applyDiff(tree, diff);
                    break;
                case 'removeTextElement':
                    diff.action = 'addTextElement';
                    this.applyDiff(tree, diff);
                    break;
                case 'addTextElement':
                    diff.action = 'removeTextElement';
                    this.applyDiff(tree, diff);
                    break;
                default:
                    console.log('unknown action');
            }

        }
    };

    if (typeof exports !== 'undefined') {
        if (typeof module !== 'undefined' && module.exports) {
            exports = module.exports = diffDOM;
        }
        exports.diffDOM = diffDOM;
    } else {
        // `window` in the browser, or `exports` on the server
        this.diffDOM = diffDOM;
    }

}.call(this));
