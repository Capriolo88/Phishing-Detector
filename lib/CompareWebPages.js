'use strict'

function getAttributeNames(node) {
    var index, rv, attrs;

    rv = [];
    attrs = node.attributes;
    for (index = 0; index < attrs.length; ++index) {
        rv.push(attrs[index].nodeName);
    }
    rv.sort();
    return rv;
}

function isEqualElements(elm1, elm2) {
    var attrs1, attrs2, name, node1, node2;

    // Compare TEXT node
    if (elm1.nodeType === elm2.nodeType && elm1.nodeType === 3) {
        return elm1.nodeValue === elm2.nodeValue;
    }

    // Compare attributes without order sensitivity
    attrs1 = getAttributeNames(elm1);
    attrs2 = getAttributeNames(elm2);
    if (attrs1.join(",") !== attrs2.join(",")) {
        console.log("Found nodes with different sets of attributes; not equiv");
        return false;
    }

    // ...and values
    // unless you want to compare DOM0 event handlers
    // (onclick="...")
    for (let index = 0; index < attrs1.length; ++index) {
        name = attrs1[index];
        if (elm1.getAttribute(name) !== elm2.getAttribute(name)) {
            console.log("Found nodes with mis-matched values for attribute '" + name + "'; not equiv");
            return false;
        }
    }

    // Walk the children
    for (node1 = elm1.firstChild, node2 = elm2.firstChild;
         node1 && node2;
         node1 = node1.nextSibling, node2 = node2.nextSibling) {
        if (node1.nodeType !== node2.nodeType) {
            console.log("Found nodes of different types; not equiv");
            return false;
        }
        if (node1.nodeType === 1) { // Element
            if (!isEqualElements(node1, node2)) {
                return false;
            }
        } else if (node1.nodeValue !== node2.nodeValue) {
            console.log("Found nodes with mis-matched nodeValues; not equiv");
            return false;
        }
    }
    if (node1 || node2) {
        // One of the elements had more nodes than the other
        console.log("Found more children of one element than the other; not equivalent");
        return false;
    }

    // Seem the same
    return true;
}

module.exports.isEqualElements = isEqualElements;