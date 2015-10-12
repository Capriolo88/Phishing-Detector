// sdk modules
const {Ci,Cu} = require("chrome"),
    self = require("sdk/self"),
    { ToggleButton } = require('sdk/ui/button/toggle'),
    panels = require("sdk/panel"),
    tabs = require("sdk/tabs"),
    TABS = require("sdk/tabs/utils");
var sp = require("sdk/simple-prefs");
// Custom modules
const FormValidator = require("./FormValidator"),
    {URLValidator, skippable} = require("./URLValidator"),
    {DomainCache, DomainList, resetStorage} = require("./DomainLists"),
    {ArrayList, WhiteList, URLCheckedList, SimpleList, LogList} = require("./Lists"),
    {makeDir, path} = require("./IO"),
    Timer = require("./Timer"),
    Log = require("./Log"),
    WekaAnalyzer = require("./WekaAnalyzer");
// jsm modules
Cu.import('resource://gre/modules/Services.jsm');

// Global Variables
var checked_urls, tabs_control = new SimpleList(), domainList, pending_request = new ArrayList();


var log_list = new LogList(1);
//log_list.timerOn(30000);
log_list.onComplete(logListener);

function logListener(array) {
    console.log('Log: ' + array.toString());
    Log.log(array);
}

var button = ToggleButton({
    id: "phishing-detector",
    label: "Phishing \r\nDetector",
    icon: {
        "16": "./img/icon-16.png",
        "32": "./img/icon-32.png",
        "64": "./img/icon-64.png"
    },
    onChange: handleChange
});

function handleChange(state) {
    let valid = checked_urls.isValid(tabs.activeTab.url);
    if (valid !== null && valid !== true) {
        //if (!state.badge)
        button.state('tab', {
            checked: false,
            badge: 'WARN',
            badgeColor: typeof valid === 'boolean' ? '#AA0000' : '#FF4400'
        });
        panel.show({position: button});
    } else
        button.state('tab', {checked: false});
}

var panel = panels.Panel({
    width: 480,
    contentURL: self.data.url("panel.html"),
    contentScriptFile: self.data.url("panelScript.js")
});

panel.on('message', function (message) {
    if (message.code === 'go') {
        //tabs_control.delete(tabs.activeTab.id);
        panel.hide();
    }
});

panel.on('hide', function (state) {
    //if (tabs_control.exist(tabs.activeTab.id))
    //    panel.show({position: button});
});

sp.on("", onPrefChange);
function onPrefChange(prefName) {
    switch (prefName) {
        case 'weka':
            sp.prefs.weka ? WekaAnalyzer.activate(function () {
                console.log('activate weka analysis');
            }) : WekaAnalyzer.deactivate(function () {
                console.log('deactivate weka analysis');
            });
            sp.prefs.weka ? log_list.setFireCount(2) : log_list.setFireCount(1);
            break;
    }
}

sp.on("reset", function () {
    checked_urls.reset();
    tabs_control.reset();
    log_list.reset();
    resetStorage();
    button.state('window', null);
});

exports.main = function (options, callbacks) {
    checked_urls = URLCheckedList.load();
    domainList = new DomainList();
    domainList.load();
    Services.obs.addObserver(httpRequestObserver, "http-on-opening-request", false);
    if (options.loadReason !== 'install') {
        DomainCache.load();
        sp.prefs.weka ? log_list.setFireCount(2) : log_list.setFireCount(1);
        sp.prefs.weka ? WekaAnalyzer.activate(function () {
            console.log('activate weka analysis');
        }) : WekaAnalyzer.deactivate(function () {
            console.log('deactivate weka analysis');
        });
    }
    if (options.loadReason === 'install') {
        makeDir(path());
        // load del trainer file nella cartella locale per le modifiche successive o scaricato dal server
        //WekaAnalyzer.install(function () {
        //    console.log('install weka analysis');
        //});
    }
};

exports.onUnload = function (reason) {
    console.log(reason);
    if (reason !== 'uninstall') {
        console.log('salvataggi');
        DomainCache.save();
        checked_urls.save();
    }
};

var httpRequestObserver = {
    observe: function (subject, topic, data) {
        if (topic == "http-on-opening-request") {
            var httpChannel = subject.QueryInterface(Ci.nsIHttpChannel),
                requestURL = httpChannel.URI.spec;

            if (httpChannel.loadFlags & httpChannel.LOAD_INITIAL_DOCUMENT_URI)
                console.log('->' + requestURL + '<-');
            else
                return;

            let aTab = loadContextTab(httpChannel);
            var tab = null;
            if (aTab) {
                tab = getTabFromId(TABS.getTabId(aTab));
                aTab = null;
            } else {
                console.log('skip: no context tab');
                return;
            }

            if (skippable(requestURL)) {
                console.log('skippable url');
                if (requestURL.search('^(about\:|wyciwyg\:\/\/|resource\:\/\/)') == -1)
                    button.state(tab, {checked: false});
                return;
            }

            if (!checked_urls.exist(requestURL)) {
                log_list.insert(requestURL);
                //if (!pending_request.insert(referrerURL))
                //    return;
                console.log('verification');
                var timer_verification = (new Timer()).start();
                var verification = URLValidator(requestURL, domainList);
                var timer_weka = (new Timer()).start();
                var weka_result = WekaAnalyzer.classifyURL(requestURL);
                if (weka_result)
                    weka_result.then((result)=> {
                        let time = timer_weka.stop();
                        console.log('Weka Analyzer:   [' + time + 'ms]\r\npredicted: ' +
                            (result.predicted == 1 ? '(1) PHISHING.' : '(0) NO PHISHING.') +
                            ' Whith probability: ' + (result.prediction * 100) + '%');
                        log_list.set(requestURL, [{
                            weka_analyzer: {
                                predicted: result.predicted,
                                precision: result.prediction
                            }
                        }]);
                    }, (err)=> {
                        let time = timer_weka.stop();
                        console.log('Weka Analyzer:   [' + time + 'ms]\r\nerror:');
                        console.log(err);
                        log_list.set(requestURL, [{
                            weka_analyzer: err
                        }]);
                    });

                // verification.valid == false, in tutti gli altri casi faccio il controllo sulle form
                if (verification.levelDomains.length > 1) {
                    let time = timer_verification.stop();
                    console.log('PHISHING. number of tld >1   [' + time + 'ms]');
                    log_list.set(requestURL, ['PHISHING', requestURL, verification, null]);
                    //Log.log('PHISHING', referrerURL, verification);
                    // domini multipli
                    checked_urls.insert(requestURL, false);
                    tab.activate();
                    //tabs_control.set(tab.id, false);
                    button.state(tab, {badge: 'WARN', badgeColor: '#AA0000'});
                    panel.show({position: button});
                    panel.postMessage({code: 'url', url: requestURL, phish: true});
                } else {
                    // se sono insicuro faccio il checkForm altrimenti blocco la pagina
                    console.log('form validation');
                    FormValidator(requestURL, verification.domain).then((res)=> {
                        let time = timer_verification.stop();
                        console.log('FormValidator:   [' + time + 'ms]');
                        console.log(res);
                        let valid = typeof res.phishState === 'boolean' ? !res.phishState : res.phishState;
                        checked_urls.insert(requestURL, valid);
                        if (res.phishState !== false) {
                            //Log.log('PHISHING', referrerURL, verification, res);
                            log_list.set(requestURL, ['PHISHING', requestURL, verification, res]);
                            tab.activate();
                            //tabs_control.set(tab.id, false);
                            button.state(tab, {
                                badge: 'WARN',
                                badgeColor: typeof valid === 'boolean' ? '#AA0000' : '#FF4400'
                            });
                            panel.show({position: button});
                            panel.postMessage({
                                code: 'url',
                                url: requestURL,
                                phish: typeof res.phishState === 'boolean'
                            });
                        } else {
                            log_list.set(requestURL, ['CLEAR', requestURL, verification, res]);
                            //Log.log('CLEAR', referrerURL, verification, res);
                        }
                    }, (error)=> {
                        let time = timer_verification.stop();
                        console.log('FormValidator:   [' + time + 'ms]\r\nerror:');
                        console.log(error);
                        log_list.set(requestURL, ['ERROR', requestURL, verification, error]);
                        //Log.error(error);
                    });
                }
            } else {
                let valid = checked_urls.isValid(requestURL);
                console.log('Url gia controllato, Valido: ' + valid);
                if (valid !== true) {
                    tab.activate();
                    //tabs_control.set(tab.id, false);
                    button.state(tab, {
                        badge: 'WARN',
                        badgeColor: typeof valid === 'boolean' ? '#AA0000' : '#FF4400'
                    });
                    panel.show({position: button});
                    panel.postMessage({code: 'url', url: requestURL, phish: typeof valid === 'boolean'});
                } else {
                    button.state(tab, {checked: false});
                }
            }
        }
    }
};

//this function gets the contentWindow and other good stuff from loadContext of httpChannel
function loadContextTab(httpChannel) {
    //httpChannel must be the subject of http-on-modify-request QI'ed to nsiHTTPChannel as is done on line 8 "httpChannel = subject.QueryInterface(Ci.nsIHttpChannel);"
    //start loadContext stuff
    var loadContext;
    try {
        var interfaceRequestor = httpChannel.notificationCallbacks.QueryInterface(Ci.nsIInterfaceRequestor);
        try {
            loadContext = interfaceRequestor.getInterface(Ci.nsILoadContext);
        } catch (ex) {
            try {
                loadContext = subject.loadGroup.notificationCallbacks.getInterface(Ci.nsILoadContext);
            } catch (ex2) {
            }
        }
    } catch (ex0) {
    }

    if (!loadContext) {
        //no load context so dont do anything although you can run this, which is your old code
        //this probably means that its loading an ajax call or like a google ad thing
        return null;
    } else {
        var contentWindow = loadContext.associatedWindow;
        if (!contentWindow) {
            //this channel does not have a window, its probably loading a resource
            //this probably means that its loading an ajax call or like a google ad thing
            return null;
        } else {
            //this is the clickable tab xul element, the one found in the tab strip of the firefox window, aTab.linkedBrowser is same as browser var above //can stylize tab like aTab.style.backgroundColor = 'blue'; //can stylize the tab like aTab.style.fontColor = 'red';
            var aTab = contentWindow.top.QueryInterface(Ci.nsIInterfaceRequestor)
                .getInterface(Ci.nsIWebNavigation)
                .QueryInterface(Ci.nsIDocShellTreeItem)
                .rootTreeItem
                .QueryInterface(Ci.nsIInterfaceRequestor)
                .getInterface(Ci.nsIDOMWindow)
                .gBrowser
                ._getTabForContentWindow(contentWindow.top);
            return aTab;
        }
    }
    //end loadContext stuff
}

function getTabFromId(tabId) {
    for (let i = 0; i < tabs.length; i++)
        if (tabs[i].id === tabId)
            return tabs[i];
    return null;
}