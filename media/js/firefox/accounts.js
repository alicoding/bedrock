/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

;(function(Mozilla, $) {
    'use strict';

    var params = new window._SearchParams();

    var $fxaFrame = $('#fxa');
    var fxaIframeHost = $('main').data('fxa-iframe-host');
    var fxaIframeSrc = $fxaFrame.data('src');
    var _resizeTimer;
    var _uitourTimeout;
    var _fxaHandshake = false;

    // remove trailing slash from iframe src (if present)
    fxaIframeHost = (fxaIframeHost[fxaIframeHost.length - 1] === '/') ? fxaIframeHost.substr(0, fxaIframeHost.length - 1) : fxaIframeHost;

    // check user's Fx version to determine FxA iframe experience
    if (Mozilla.Client.FirefoxMajorVersion >= 46) {
        fxaIframeSrc = fxaIframeSrc.replace('context=iframe', 'context=fx_firstrun_v2');
    }

    // if email address provided in querystring, send to FxA frame
    if (params.get('fxa-email')) {
        fxaIframeSrc += '&email=' + params.get('fxa-email');
    }

    function onFormPing(data) {
        var fxaFrameTarget = $fxaFrame[0].contentWindow;
        fxaFrameTarget.postMessage(data, fxaIframeHost);
        _fxaHandshake = true;
    }

    function onFormResize(height) {
        clearTimeout(_resizeTimer);
        // sometimes resizes come in bunches - only want to react to the last of a set
        _resizeTimer = setTimeout(function() {
            showFxAccountsForm(height);
        }, 300);
    }

    function onFormLogin() {
        sendGAEvent('sign-in');
        redirectToAccountSettings();
    }

    function redirectToAccountSettings() {
        window.location.href = fxaIframeHost + '/settings';
    }

    function redirectToSyncPage() {
        sendGAEvent('invalid');
        window.location.href = window.location.protocol + '//' + window.location.host + '/firefox/sync/';
    }

    function showFxAccountsForm(height) {
        var formHeight = height !== undefined ? height : 450;
        $fxaFrame.css('height', formHeight + 'px').addClass('loaded');
    }

    function sendGAEvent(type, label) {
        // we'll always have a type
        var data = {
            'event': 'mau2account',
            'interaction': type
        };

        // label may or may not be provided
        if (label !== undefined) {
            data.label = label;
        }

        window.dataLayer.push(data);
    }

    // set up communication with FxA iframe
    function onMessageReceived(e) {
        // make sure origin is as expected
        if (e.origin !== fxaIframeHost) {
            return;
        }

        var data = JSON.parse(e.data);

        switch (data.command) {
        // tell iframe we are expecting it
        case 'ping':
            onFormPing(e.data);
            break;
        // just GA tracking when iframe loads
        case 'loaded':
            sendGAEvent('impression');
            break;
        // resize container when iframe resizes for nicer UI
        case 'resize':
            onFormResize(data.data.height);
            break;
        // track when user signs up successfully (but hasn't yet verified email)
        case 'signup_must_verify':
            // if emailOptIn property is present, send value to GA
            if (data.data.hasOwnProperty('emailOptIn')) {
                sendGAEvent('email opt-in', data.data.emailOptIn);
            }

            sendGAEvent('success');
            break;
        // track when user returns to page after verifying email (may never happen)
        case 'verification_complete':
            sendGAEvent('verified');
            break;
        // track & redirect user with FxA account logging in
        case 'login':
            onFormLogin();
            break;
        }
    }

    function loadFxAccountsForm() {
        // bind postMessage event listener
        window.addEventListener('message', onMessageReceived, true);

        // load FxA iframe only after postMessage communication is configured
        $fxaFrame.attr('src', fxaIframeSrc);

        // set a timeout to show FxA (error page, most likely) should the ping event
        // above fail for some reason
        setTimeout(function() {
            if (!_fxaHandshake) {
                showFxAccountsForm();
            }
        }, 2500);

        //
        setTimeout(Mozilla.syncAnimation, 1000);
    }

    // if user is not on Firefox for Desktop, redirect to the /firefox/sync/ page.
    if (window.Mozilla.Client.isFirefoxDesktop) {
        // if uitour callback does not fire in 500ms, load the iframe anyway.
        _uitourTimeout = setTimeout(loadFxAccountsForm, 500);
        // if user is signed into sync, redirect the /firefox/sync/ page,
        // else load the FxA iframe.
        Mozilla.UITour.getConfiguration('sync', function (config) {
            clearTimeout(_uitourTimeout);
            if (config.setup) {
                redirectToSyncPage();
            } else {
                loadFxAccountsForm();
            }
        });
    } else {
        redirectToSyncPage();
    }

})(window.Mozilla, window.jQuery);
