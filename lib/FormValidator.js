'use strict';

const {Ci,Cc,Cu} = require("chrome"),
    {XMLHttpRequest} = require("sdk/net/xhr"),
    {URL} = require("sdk/url"),
    Random = require("./Random"),
    ErrorSeeker = require("./ErrorSeeker"),
    {isEqualElements}=require("./CompareWebPages");
Cu.import("resource://gre/modules/Promise.jsm");

/**
 * Perform html requests to check if there exist a login form and if it is a phishing form
 * @param {string} url
 * @param {string} source_domain
 * @returns {Promise}
 */
function formValidator(url, source_domain) {

    var XHRSource = new XMLHttpRequest(),
        promise = Promise.defer();
    XHRSource.open('GET', url);
    XHRSource.responseType = 'document';

    XHRSource.onload = ()=> {
        if (XHRSource.status !== 200) {
            promise.reject({
                errNo: 1,
                url: XHRSource.response.baseURI,
                status: XHRSource.status,
                text: XHRSource.statusText
            });
            return;
        }
        console.log('Yeah! Page loaded.\n' + XHRSource.response.baseURI + '\n' + XHRSource.status + ': ' + XHRSource.statusText);
        var form = findForm(XHRSource.response);
        if (!form) {
            promise.reject({
                errNo: 2,
                url: XHRSource.response.baseURI,
                status: null,
                text: 'No Login Form in the Page'
            });
            return;
        }
        var formData = fillFormData(form);
        // TODO Modify to implement the GET method
        var method = form.method || 'POST';
        if (method === 'GET') {
            promise.reject({
                errNo: 4,
                url: XHRSource.response.baseURI,
                status: null,
                text: 'Method of form "GET"'
            });
            return;
        }
        var XHRDestination = new XMLHttpRequest();
        XHRDestination.open('POST', form.action);
        XHRDestination.responseType = 'document';

        XHRDestination.onload = ()=> {
            if (XHRDestination.status !== 200) {
                promise.reject({
                    errNo: 3,
                    url: XHRDestination.response.baseURI,
                    status: XHRDestination.status,
                    text: XHRDestination.statusText
                });
                return;
            }

            console.log('Yeah! Form sent and response loaded.\n' + XHRDestination.response.baseURI + '\n' + XHRDestination.status + ': ' + XHRDestination.statusText);

            let comp = compareURLDomain(source_domain, XHRDestination.response.baseURI);
            console.log('domini uguali? ' + comp.equal);

            if (!comp.equal) {
                console.log('Sito di phishing');
                promise.resolve({
                    phishState: true,
                    reason: 'Different domain in URL. ***' + comp.domain1 + ' <==> ' + comp.domain2 + '***',
                    elements: null
                });
                return;
            }

            let errorSeekerD = new ErrorSeeker(), errorSeekerS = new ErrorSeeker();
            errorSeekerD.seek(XHRDestination.response);
            errorSeekerS.seek(XHRSource.response);
            var errD = errorSeekerD.getErrors(), errS = errorSeekerS.getErrors();
            if (errD.length > 0 && errD.length === errS.length) {
                let equal = true;
                for (let i = 0; i < errD.length && equal; i++) {
                    equal = isEqualElements(errD[i], errS[i]);
                }
                if (equal) {
                    console.log('It\'s probably a Phishing site');
                    promise.resolve({
                        phishState: 'maybe',
                        reason: 'Errors found in Source and Destination page, it\'s probably a Phishing Web Page',
                        elements: errD
                    });
                    return;
                }
            } else if (errS.length > 0 && errD.length == errS.length + 1) {
                let el, count = 0;
                for (let i = 0; i < errD.length; i++) {
                    el = errD[i];
                    for (let j = 0; j < errS.length; j++) {
                        if (isEqualElements(errD[i], errS[j]))
                            break;
                        if (j === errS.length - 1)
                            count++;
                    }
                }
                if (count === 1) {
                    console.log('It\'s probably a Phishing site');
                    promise.resolve({
                        phishState: 'maybe',
                        reason: 'Errors found in Source and Destination page, it\'s probably a Phishing Web Page',
                        elements: errD
                    });
                    return;
                }
            } else if (errD.length === 1) {
                if (errD[0].nodeType === 3 && errD[0].nodeValue.search("error|alert|warn|atten|not valid") === -1) {
                    console.log('It\'s probably a Phishing site');
                    promise.resolve({
                        phishState: 'maybe',
                        reason: 'Errors found Destination page, but it\'s probably a Phishing Web Page',
                        elements: errD
                    });
                    return;
                }
            }
            errD.forEach((element, index, array) => {
                console.log(index + ': ' + element.outerHTML);
                array[index] = element.outerHTML;
                return element.outerHTML;
            });
            console.log(errD.length === 0 ? 'No errors found in page, it\'s probably a Phishing site.' : 'Errors found in page, it\'s not a Phishing site');

            promise.resolve({
                phishState: errD.length !== 0 ? false : 'maybe',
                reason: errD.length !== 0 ? null : 'No errors found in page, it\'s probably a Phishing Web Page',
                elements: errD.length !== 0 ? errD : null
            });
        };
        XHRDestination.send(formData);
    };
    XHRSource.send(null);
    return promise.promise;
}

/**
 * Find the login form in the page if exist
 * @param {HTMLDocument} document The document of the page
 * @returns {?HTMLFormElement} The login form if exist, null otherwise
 */
function findForm(document) {
    // controllare se c'è una form compatibile per il login
    var frames, i, forms = document.getElementsByTagName('form');
    if (forms) {
        for (i = 0; i < (forms.length); i++) {
            if (isLoginForm(forms[i]))
                return forms[i];
        }
    } else if ((frames = document.getElementsByTagName('iframe'))) {
        var frame;
        for (let j = 0; j < frames.length; j++) {
            frame = frames[j];
            if (frame.contentDocument && frame.contentDocument.forms)
                for (i = 0; i < (frame.contentDocument.forms.length); i++) {
                    if (isLoginForm(frame.contentDocument.forms[i]))
                        return frame.contentDocument.forms[i];
                }
        }
    }
    return null;
}

/**
 * Check if a form is a login form
 * @param {HTMLFormElement} form The form to analize
 * @returns {boolean} true if is a login form, false otherwise
 */
function isLoginForm(form) {
    if ((form.getAttribute('role') && form.getAttribute('role').search('search') != -1) ||
        (form.getAttribute('id') && form.getAttribute('id').search('search') != -1) ||
        (form.getAttribute('name') && form.getAttribute('name').search('search') != -1))
        return false;
    var count = 0, type, submit = false;
    for (var i in form.elements) {
        type = form.elements[i].type;
        if (type && type !== 'hidden' && type !== 'fieldset' && type !== 'radio' && type !== 'checkbox') {
            if (type === 'submit') {
                if (!submit)
                    submit = true;
                else
                    continue;
            } else if (type === 'password')
                return true;
            else if (type === 'search')
                return false;
            count++;
        }
    }
    if (count > 2) {
        if ((form.getAttribute('role') && form.getAttribute('role').search('login|logon|sign|registra|^add$') != -1) ||
            (form.getAttribute('id') && form.getAttribute('id').search('login|logon|sign|registra|^add$') != -1 ) ||
            (form.getAttribute('name') && form.getAttribute('name').search('login|logon|sign|registra|^add$') != -1 ))
            return false;
        return true;
    }
    return false;
}

/**
 * Fill a FormData object with the elements of the form [form]
 * @param {HTMLFormElement} form
 * @returns {FormData}
 */
function fillFormData(form) {
    var inputmode, min, max, type, el, formData = Cc['@mozilla.org/files/formdata;1'].createInstance(Ci.nsIDOMFormData);
    for (let i = 0; i < form.elements.length; i++) {
        el = form.elements[i],
            inputmode = el.inputMode || null,
            min = (el.minLength && el.minLength > 0) ? el.minLength : null,
            max = (el.maxLength && el.maxLength > 0) ? el.maxLength : null,
            type = el.type || null;
        if (!type || type.search('button|submit|checkbox|fieldset') != -1)
            continue;
        switch (type) {
            case 'hidden':
                formData.append(el.name, el.value);
                continue;
            case 'email':
                inputmode = (inputmode && inputmode !== 'auto') ? inputmode : type;
                break;
            case 'password':
                inputmode = (inputmode && inputmode !== 'auto') ? inputmode : type;
                break;
            case 'numeric':
                inputmode = (inputmode && inputmode !== 'auto') ? inputmode : type;
                break;
            case 'text':
                if (el.name.search('mail') != -1)
                    inputmode = 'email';
                else if (el.name.search('pass') != -1)
                    inputmode = 'password';
                break;
            case 'radio':
                if (el.checked)
                    formData.append(el.name, el.value);
                continue;
        }
        formData.append(el.name, el.value === '' ? getRandomStrVal(inputmode, min, max) : el.value);
    }
    return formData;
}

/**
 * @param {?string} inputmode
 * @param {?number} min
 * @param {?number} max
 * @returns {string} random string of length between min and max
 */
function getRandomStrVal(inputmode, min, max) {
    var length = Random.randomNumber(min, max), ret;
    if (inputmode === 'numeric') {
        ret = Random.randomString(length, Random.NUMSET);
    } else if (inputmode === 'email') {
        ret = Random.randomString(8, Random.DIGIT) + '@' + Random.randomString(1, Random.MAILPROVIDERS);
    } else if (inputmode && inputmode.search('latin') != -1) {
        ret = Random.randomString(length, Random.CHARSET);
    } else {
        ret = Random.randomString(length, Random.DIGIT);
    }
    return ret;
}

/**
 * Compare two urls and their domain
 * @param source_domain
 * @param url2
 * @returns {{equal: boolean, domain1: string, domain2: string}}
 */
function compareURLDomain(source_domain, url2) {
    url2 = url2 instanceof URL ? url2 : URL(url2);
    var host2 = url2.host.split('.'),
        dom2 = host2.pop(),
        source_length = source_domain.split('.').length;
    for (let i = 1; i < source_length; i++)
        dom2 = host2.pop() + '.' + dom2;
    var ret = {equal: false, domain1: source_domain, domain2: dom2};
    if (source_domain === dom2)
        ret.equal = true;
    return ret;
}

module.exports = formValidator;