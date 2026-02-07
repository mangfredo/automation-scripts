// ==UserScript==
// @name         Jira to Lifeguard Quick Access
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  Add buttons to quickly open Lifeguard with staging/prod URLs from Jira tickets
// @author       Tristan Sereño
// @match        https://silkroadtech.atlassian.net/*
// @match        https://lifeguard.silkroad.com/*
// @updateURL   https://raw.githubusercontent.com/mangfredo/automation-scripts/main/jira-to-lifeguard.js
// @downloadURL https://raw.githubusercontent.com/mangfredo/automation-scripts/main/jira-to-lifeguard.js
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    const isJira = window.location.hostname === 'silkroadtech.atlassian.net';
    const isLifeguard = window.location.hostname === 'lifeguard.silkroad.com';

    const storage = {
        set: function(key, value) {
            if (typeof GM_setValue !== 'undefined') {
                GM_setValue(key, value);
            } else {
                localStorage.setItem(key, JSON.stringify(value));
            }
        },
        get: function(key) {
            if (typeof GM_getValue !== 'undefined') {
                return GM_getValue(key);
            } else {
                const item = localStorage.getItem(key);
                try {
                    return JSON.parse(item);
                } catch (e) {
                    return item;
                }
            }
        }
    };

    if (isJira) {
        let lastUrl = location.href;

        function isTicketPage() {
            return /\/browse\/[A-Z]+-\d+/.test(window.location.href);
        }

        function getTicketNumber() {
            const urlMatch = window.location.href.match(/browse\/([A-Z]+-\d+)/);
            return urlMatch ? urlMatch[1] : '';
        }

        function forceLoadLazyContent() {
            return new Promise((resolve) => {
                const urlFieldSelectors = [
                    '[data-testid="issue.issue-view-layout.issue-view-url-field.customfield_10198"]',
                    '[data-testid="issue.issue-view-layout.issue-view-url-field.customfield_10279"]'
                ];

                let urlField = document.querySelector(urlFieldSelectors[0]) || document.querySelector(urlFieldSelectors[1]);

                if (urlField) {
                    urlField.scrollIntoView({ behavior: 'auto', block: 'center' });
                    setTimeout(() => {
                        console.log('[Lifeguard] Lazy content loading complete');
                        resolve();
                    }, 1000);
                } else {
                    const detailsSection = document.querySelector('[data-testid="issue-view-layout-group.common.ui.collapsible-group-factory.details-group"]');
                    if (detailsSection) {
                        detailsSection.scrollIntoView({ behavior: 'auto', block: 'start' });
                        setTimeout(() => {
                            window.scrollBy({ top: window.innerHeight, behavior: 'auto' });
                            setTimeout(() => {
                                console.log('[Lifeguard] Lazy content loading complete (fallback)');
                                resolve();
                            }, 1000);
                        }, 500);
                    } else {
                        console.log('[Lifeguard] Details section not found, resolving anyway');
                        resolve();
                    }
                }
            });
        }

        async function getURLsWithRetry(maxRetries = 3) {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                const customerSiteURL = extractURL('issue.issue-view-layout.issue-view-url-field.customfield_10198');
                const customerStageURL = extractURL('issue.issue-view-layout.issue-view-url-field.customfield_10279');

                if (customerSiteURL || customerStageURL) {
                    console.log(`[Lifeguard] URLs found on attempt ${attempt}`);
                    return { customerSiteURL, customerStageURL };
                }

                if (attempt < maxRetries) {
                    console.log(`[Lifeguard] URLs not found, attempt ${attempt}/${maxRetries}, scrolling again...`);
                    await forceLoadLazyContent();
                    await new Promise(r => setTimeout(r, 500));
                }
            }

            console.log('[Lifeguard] URLs not found after all retries');
            return { customerSiteURL: null, customerStageURL: null };
        }

        function parseURLs(customerSiteURL, customerStageURL) {
            const isSiteURLTest = customerSiteURL && (customerSiteURL.includes('-test') || customerSiteURL.includes('-dev'));
            const isSiteURLStaging = customerSiteURL && customerSiteURL.includes('-staging');
            const isStageURLTest = customerStageURL && (customerStageURL.includes('-test') || customerStageURL.includes('-dev'));
            const isStageURLStaging = customerStageURL && customerStageURL.includes('-staging');

            let testURL = null;
            let stagingURL = null;
            let prodURL = null;

            if (isSiteURLTest) {
                testURL = customerSiteURL;
                if (customerStageURL && !isStageURLTest && !isStageURLStaging) {
                    prodURL = customerStageURL;
                }
            } else if (isSiteURLStaging) {
                stagingURL = customerSiteURL;
                if (customerStageURL && !isStageURLTest && !isStageURLStaging) {
                    prodURL = customerStageURL;
                }
            } else {
                prodURL = customerSiteURL;
                if (isStageURLTest) {
                    testURL = customerStageURL;
                } else if (isStageURLStaging) {
                    stagingURL = customerStageURL;
                }
            }

            return { testURL, stagingURL, prodURL };
        }

        function extractURL(testId) {
            const field = document.querySelector(`[data-testid="${testId}"]`);
            if (!field) return null;
            const link = field.querySelector('a[data-testid="smart-links-container-layered-link"]');
            return link ? link.href : null;
        }

        function getHostname(url) {
            try {
                const urlObj = new URL(url);
                return urlObj.hostname;
            } catch (e) {
                return null;
            }
        }

        function openLifeguard(hostname, ticketNumber) {
            if (!hostname) {
                alert('Unable to find the URL for this environment');
                return;
            }

            storage.set('lifeguard_hostname', hostname);
            storage.set('lifeguard_ticket', ticketNumber);
            storage.set('lifeguard_timestamp', Date.now());

            window.open('https://lifeguard.silkroad.com/', '_blank');
            showNotification('Opening Lifeguard...');
        }

        function showNotification(message) {
            const notification = document.createElement('div');
            notification.textContent = message;
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background-color: #0052CC;
                color: white;
                padding: 12px 20px;
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                z-index: 10000;
                font-size: 14px;
                max-width: 300px;
            `;
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 3000);
        }

        function showErrorNotification(message) {
            const notification = document.createElement('div');
            notification.textContent = message;
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background-color: #DE350B;
                color: white;
                padding: 12px 20px;
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                z-index: 10000;
                font-size: 14px;
                max-width: 300px;
            `;
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 4000);
        }

        async function createButtons() {
            if (!isTicketPage()) return;

            if (document.getElementById('lifeguard-floating-container')) {
                return;
            }

            const ticketNumber = getTicketNumber();

            // Initial scroll to trigger lazy loading
            await forceLoadLazyContent();

            const floatingContainer = document.createElement('div');
            floatingContainer.id = 'lifeguard-floating-container';
            floatingContainer.style.cssText = `
                position: fixed;
                bottom: 100px;
                right: 20px;
                z-index: 9999;
            `;

            const mainButton = document.createElement('div');
            mainButton.id = 'lifeguard-main-btn';
            mainButton.style.cssText = `
                width: 60px;
                height: 60px;
                background: #0052CC;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                transition: background-color 0.2s;
            `;

            const logo = document.createElement('img');
            logo.src = 'https://i.imgur.com/7XW4oTP.png';
            logo.style.cssText = `
                width: 35px;
                height: 35px;
            `;
            mainButton.appendChild(logo);

            mainButton.onmouseover = () => mainButton.style.backgroundColor = '#0065FF';
            mainButton.onmouseout = () => mainButton.style.backgroundColor = '#0052CC';

            const optionsContainer = document.createElement('div');
            optionsContainer.id = 'lifeguard-options';
            optionsContainer.style.cssText = `
                position: absolute;
                bottom: 70px;
                right: 0;
                display: none;
                flex-direction: column;
                gap: 8px;
            `;

            const stagingButton = document.createElement('div');
            stagingButton.textContent = 'Open Staging/Test';
            stagingButton.style.cssText = `
                background: #0052CC;
                color: white;
                padding: 10px 15px;
                border-radius: 20px;
                cursor: pointer;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                white-space: nowrap;
                font-size: 14px;
                font-weight: 500;
                transition: background-color 0.2s;
            `;
            stagingButton.onmouseover = () => stagingButton.style.backgroundColor = '#0065FF';
            stagingButton.onmouseout = () => stagingButton.style.backgroundColor = '#0052CC';
            stagingButton.onclick = async () => {
                // Extract URLs at click time with retry
                const { customerSiteURL, customerStageURL } = await getURLsWithRetry();
                const { testURL, stagingURL, prodURL } = parseURLs(customerSiteURL, customerStageURL);
                const stagingTestUrl = testURL || stagingURL;

                console.log('[Lifeguard] Click - Staging/Test URL:', stagingTestUrl);

                if (!stagingTestUrl) {
                    showErrorNotification('❌ Staging/Test URL not found in this Jira ticket');
                    optionsContainer.style.display = 'none';
                    return;
                }
                const hostname = getHostname(stagingTestUrl);
                openLifeguard(hostname, ticketNumber);
                optionsContainer.style.display = 'none';
            };
            optionsContainer.appendChild(stagingButton);

            const prodButton = document.createElement('div');
            prodButton.textContent = 'Open Prod';
            prodButton.style.cssText = `
                background: #00875A;
                color: white;
                padding: 10px 15px;
                border-radius: 20px;
                cursor: pointer;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                white-space: nowrap;
                font-size: 14px;
                font-weight: 500;
                transition: background-color 0.2s;
            `;
            prodButton.onmouseover = () => prodButton.style.backgroundColor = '#00A86B';
            prodButton.onmouseout = () => prodButton.style.backgroundColor = '#00875A';
            prodButton.onclick = async () => {
                // Extract URLs at click time with retry
                const { customerSiteURL, customerStageURL } = await getURLsWithRetry();
                const { testURL, stagingURL, prodURL } = parseURLs(customerSiteURL, customerStageURL);

                console.log('[Lifeguard] Click - Prod URL:', prodURL);

                if (!prodURL) {
                    showErrorNotification('❌ Production URL not found in this Jira ticket');
                    optionsContainer.style.display = 'none';
                    return;
                }
                const hostname = getHostname(prodURL);
                openLifeguard(hostname, ticketNumber);
                optionsContainer.style.display = 'none';
            };
            optionsContainer.appendChild(prodButton);

            mainButton.onclick = () => {
                optionsContainer.style.display =
                    optionsContainer.style.display === 'none' ? 'flex' : 'none';
            };

            floatingContainer.appendChild(optionsContainer);
            floatingContainer.appendChild(mainButton);

            document.body.appendChild(floatingContainer);
        }

        function removeButtons() {
            const container = document.getElementById('lifeguard-floating-container');
            if (container) container.remove();
        }

        function checkUrlChange() {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                removeButtons();
                if (isTicketPage()) {
                    setTimeout(createButtons, 1000);
                }
            }
        }

        const observer = new MutationObserver(() => {
            checkUrlChange();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        if (isTicketPage()) {
            setTimeout(createButtons, 2000);
        }
    }

    if (isLifeguard) {
        function isLoginPage() {
            return document.getElementById('UserName') && document.getElementById('Password');
        }

        function fillLifeguardForm() {
            if (isLoginPage()) {
                return;
            }

            const hostname = storage.get('lifeguard_hostname');
            const ticket = storage.get('lifeguard_ticket');
            const timestamp = storage.get('lifeguard_timestamp');

            if (!hostname || !ticket || !timestamp || (Date.now() - timestamp > 300000)) {
                return;
            }

            const hostInput = document.getElementById('HostName');
            const reasonSelect = document.getElementById('reasoncodeid');
            const ticketInput = document.getElementById('JiraTicket');

            if (hostInput && reasonSelect && ticketInput) {
                hostInput.value = hostname;
                hostInput.dispatchEvent(new Event('input', { bubbles: true }));
                if (window.jQuery) {
                    window.jQuery(hostInput).trigger('input');
                }

                setTimeout(() => {
                    hostInput.blur();
                    document.body.click();

                    setTimeout(() => {
                        reasonSelect.value = 'Config';
                        reasonSelect.dispatchEvent(new Event('change', { bubbles: true }));

                        setTimeout(() => {
                            ticketInput.value = ticket;
                            ticketInput.dispatchEvent(new Event('input', { bubbles: true }));

                            storage.set('lifeguard_hostname', null);
                            storage.set('lifeguard_ticket', null);
                            storage.set('lifeguard_timestamp', null);

                            showSuccessMessage();
                        }, 100);
                    }, 200);
                }, 300);
            }
        }

        function showSuccessMessage() {
            const message = document.createElement('div');
            message.textContent = '✓ Form filled from Jira data';
            message.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background-color: #00875A;
                color: white;
                padding: 12px 20px;
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                z-index: 10000;
                font-size: 14px;
            `;
            document.body.appendChild(message);
            setTimeout(() => message.remove(), 3000);
        }

        function initLifeguard() {
            if (isLoginPage()) {
                const loginObserver = new MutationObserver(() => {
                    if (!isLoginPage()) {
                        loginObserver.disconnect();
                        setTimeout(fillLifeguardForm, 1000);
                    }
                });

                loginObserver.observe(document.body, {
                    childList: true,
                    subtree: true
                });
                return;
            }

            const checkForm = setInterval(() => {
                const hostInput = document.getElementById('HostName');
                if (hostInput) {
                    clearInterval(checkForm);
                    setTimeout(fillLifeguardForm, 500);
                }
            }, 100);
            setTimeout(() => clearInterval(checkForm), 5000);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initLifeguard);
        } else {
            initLifeguard();
        }
    }

})();



