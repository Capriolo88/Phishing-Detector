'use strict'

/**
 * Class to collect the error nodes of a document
 * @constructor
 */
function ErrorSeeker() {
    var errors = [];

    this.getErrors = function () {
        return errors;
    };

    this.setErrors = function (node) {
        if (errors.indexOf(node) == -1)
            errors.push(node);
    };
}

/**
 * Search the nodes and store in errors
 * @param node
 */
ErrorSeeker.prototype.seek = function (node) {
    if (node.body)
        node = node.body;
    var val;
    const attrs = ['class', 'id', 'role'];

    for (let i = 0; i < attrs.length; i++) {
        if (!(val = node.getAttribute(attrs[i])))
            continue;
        let str = attrs[i] === 'role' ? 'alert|warning' : 'error';
        if (val.search(str) != -1) {
            console.log('Found \'' + str + '\' in attribute \'' + attrs[i] + '\'');
            //return true;
            this.setErrors(node);
        }
    }

    for (var nextNode = node.firstChild; nextNode; nextNode = nextNode.nextSibling) {
        if (nextNode.nodeName === 'SCRIPT')
            continue;
        if (nextNode.nodeType === 1) { // Element
            this.seek(nextNode);
            //if (seek(nextNode)) {
            //return true;
            // }
        } else if (nextNode.nodeValue && nextNode.nodeValue.search(/error|errore|errat/) != -1) {
            console.log("Found \'error\' in nodeValues of node: ");
            console.log(nextNode);
            //return true;
            this.setErrors(nextNode);
        }
    }
    //return false;
};

module.exports = ErrorSeeker;