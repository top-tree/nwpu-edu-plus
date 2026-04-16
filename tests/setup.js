/**
 * 测试环境初始化 — 纯 Mock 方式（不依赖 jsdom）
 * 
 * 由于 main.user.js 是油猴 IIFE 脚本，不能直接 require。
 * 本文件通过正则提取关键函数源码，然后在模拟的浏览器环境中用 eval 执行。
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * 从 main.user.js 源码中提取指定的顶层函数源代码
 */
function extractFunction(source, funcName) {
    const regex = new RegExp(`^\\s*(?:async\\s+)?function ${funcName}\\b[\\s\\S]*?\\{`, 'm');
    const match = source.match(regex);
    if (!match) return null;

    const startIndex = source.indexOf(match[0]);
    let braceCount = 0;
    let i = source.indexOf('{', startIndex);
    const start = startIndex;

    for (; i < source.length; i++) {
        if (source[i] === '{') braceCount++;
        if (source[i] === '}') braceCount--;
        if (braceCount === 0) break;
    }
    return source.slice(start, i + 1);
}

function getFunctionStartLine(source, funcName) {
    const regex = new RegExp(`^\\s*(?:async\\s+)?function ${funcName}\\b[\\s\\S]*?\\{`, 'm');
    const match = source.match(regex);
    if (!match) return null;

    const startIndex = source.indexOf(match[0]);
    return source.slice(0, startIndex).split('\n').length;
}

function resolveWindowLike(sourceHost) {
    if (!sourceHost) return {};
    if (sourceHost.window && sourceHost.window !== sourceHost) {
        return sourceHost.window;
    }
    return sourceHost;
}

/**
 * 在真实 jsdom 窗口中执行提取出的函数源码
 */
function createFunctionSandbox(sourceHost, extraGlobals = {}) {
    const windowLike = resolveWindowLike(sourceHost);
    const timerSource = windowLike || sourceHost || {};
    const sandbox = {
        ...windowLike,
        ...(sourceHost && sourceHost !== windowLike ? sourceHost : {}),
        window: windowLike,
        document: windowLike.document || sourceHost?.document,
        console,
        setTimeout: timerSource.setTimeout?.bind(timerSource),
        clearTimeout: timerSource.clearTimeout?.bind(timerSource),
        setInterval: timerSource.setInterval?.bind(timerSource),
        clearInterval: timerSource.clearInterval?.bind(timerSource),
        requestIdleCallback: timerSource.requestIdleCallback?.bind(timerSource),
        ...extraGlobals,
    };
    sandbox.globalThis = sandbox;
    return sandbox;
}

function runFunctionSourceInSandbox(sourceHost, funcSource, funcName, extraGlobals = {}, options = {}) {
    const sandbox = createFunctionSandbox(sourceHost, extraGlobals);
    const context = vm.createContext(sandbox);
    const filename = options.filename || path.join(__dirname, '..', 'main.user.js');
    const lineOffset = Number.isInteger(options.lineOffset) ? options.lineOffset : 0;
    const script = new vm.Script(`${funcSource}; _result = ${funcName};`, {
        filename,
        lineOffset,
    });
    script.runInContext(context);
    return { fn: sandbox._result, sandbox };
}

function withTemporaryGlobals(bindings, callback) {
    const previous = {};
    const keys = Object.keys(bindings || {});

    for (const key of keys) {
        previous[key] = global[key];
        global[key] = bindings[key];
    }

    try {
        return callback();
    } finally {
        for (const key of keys) {
            if (previous[key] === undefined) {
                delete global[key];
            } else {
                global[key] = previous[key];
            }
        }
    }
}

function loadFunctionInWindow(windowObj, funcSource, funcName, extraGlobals = {}, options = {}) {
    return runFunctionSourceInSandbox(windowObj, funcSource, funcName, extraGlobals, options).fn;
}

/**
 * 载入函数并返回可观察到沙箱状态的执行上下文
 */
function loadFunctionInWindowContext(windowObj, funcSource, funcName, extraGlobals = {}, options = {}) {
    return runFunctionSourceInSandbox(windowObj, funcSource, funcName, extraGlobals, options);
}

/**
 * 提取并载入指定函数，默认返回可直接调用的函数本体。
 */
function loadFunctionByName(sourceCode, funcName, host, extraGlobals = {}, returnContext = false) {
    const funcSource = extractFunction(sourceCode, funcName);
    if (!funcSource) return null;
    const startLine = getFunctionStartLine(sourceCode, funcName);
    const loaded = runFunctionSourceInSandbox(host, funcSource, funcName, extraGlobals, {
        lineOffset: startLine ? startLine - 1 : 0,
    });
    return returnContext ? loaded : loaded.fn;
}

function loadFunctionByNameInCurrentContext(sourceCode, funcName, bindings = {}) {
    const funcSource = extractFunction(sourceCode, funcName);
    if (!funcSource) return null;
    const startLine = getFunctionStartLine(sourceCode, funcName);
    const filename = path.join(__dirname, '..', 'main.user.js');
    const bindingKeys = Object.keys(bindings);
    const tempKey = '__codexFunctionBindings';
    const previous = global[tempKey];
    global[tempKey] = bindings;

    try {
        const bindingPrelude = bindingKeys.length > 0
            ? `const { ${bindingKeys.join(', ')} } = globalThis.${tempKey};\n`
            : '';
        const script = new vm.Script(`(() => {\n${bindingPrelude}${funcSource}\nreturn ${funcName};\n})()`, {
            filename,
            lineOffset: (startLine ? startLine - 1 : 0) - (bindingKeys.length > 0 ? 2 : 1),
        });
        return script.runInThisContext();
    } finally {
        if (previous === undefined) {
            delete global[tempKey];
        } else {
            global[tempKey] = previous;
        }
    }
}

/**
 * 创建模拟的 DOM Element（扩展版本，支持更多属性）
 */
function createElement(tag, attrs = {}, children = []) {
    return createElementEx(tag, attrs, children);
}

/**
 * 简易的 querySelector mock（支持常见选择器）
 */
function matchesSelector(el, selector) {
    selector = selector.trim();

    // 支持逗号分隔的多选择器：'a, button, span'
    if (selector.includes(',')) {
        return selector.split(',').some(s => matchesSelector(el, s.trim()));
    }

    // 支持后代选择器：'.a .b'、'div span'
    const parts = selector.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
        let current = el;
        if (!matchesSelector(current, parts[parts.length - 1])) return false;
        for (let i = parts.length - 2; i >= 0; i--) {
            current = current.parentNode;
            while (current && !matchesSelector(current, parts[i])) {
                current = current.parentNode;
            }
            if (!current) return false;
        }
        return true;
    }

    const attrMatches = [...selector.matchAll(/\[([^\]=\*]+)(\*?=)"([^"]*)"\]/g)];
    const base = selector.replace(/\[[^\]]+\]/g, '');

    const tagMatch = base.match(/^[a-zA-Z][\w-]*/);
    if (tagMatch && el.tagName !== tagMatch[0].toUpperCase()) return false;

    const idMatches = [...base.matchAll(/#([\w-]+)/g)];
    if (idMatches.some(m => el.id !== m[1])) return false;

    const classMatches = [...base.matchAll(/\.([\w-]+)/g)];
    if (classMatches.some(m => !(el.className || '').split(/\s+/).includes(m[1]))) return false;

    for (const [, attr, operator, val] of attrMatches) {
        const actual = el.getAttribute ? el.getAttribute(attr) : null;
        if (operator === '*=') {
            if (!String(actual || '').includes(val)) return false;
        } else if (String(actual || '') !== val) {
            return false;
        }
    }

    if (!tagMatch && !idMatches.length && !classMatches.length && !attrMatches.length) {
        return /^\w+$/.test(selector) ? el.tagName === selector.toUpperCase() : false;
    }
    return true;
}

function collectAll(node) {
    const result = [node];
    (node.childNodes || []).forEach(c => {
        result.push(...collectAll(c));
    });
    return result;
}

function mockQuerySelector(root, selector) {
    const all = collectAll(root);
    return all.find(el => matchesSelector(el, selector)) || null;
}

function mockQuerySelectorAll(root, selector) {
    const all = collectAll(root);
    return all.filter(el => matchesSelector(el, selector));
}

/**
 * 扩展的 DOM 元素创建，支持更多属性
 */
function createElementEx(tag, attrs = {}, children = []) {
    const listeners = {};
    const childNodes = [...children];
    const attributes = { ...attrs };
    const dataAttrKey = (name) => name
        .replace(/^data-/, '')
        .split('-')
        .map((part, index) => index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
    const el = {
        tagName: tag.toUpperCase(),
        id: attrs.id || '',
        className: attrs.className || '',
        textContent: attrs.textContent || '',
        innerText: attrs.innerText || attrs.textContent || '',
        innerHTML: '',
        src: attrs.src || '',
        href: attrs.href || '',
        style: attrs.style || {},
        dataset: {},
        attributes,
        offsetParent: null,
        offsetHeight: 0,
        offsetWidth: 0,
        childNodes,
        children: childNodes,
        parentNode: null,
        _removed: false,
        disabled: !!attrs.disabled,
        value: attrs.value || '',

        getAttribute(name) {
            if (name === 'id') return this.id;
            if (name === 'data-text') return this.dataset.text || null;
            if (name === 'href') return this.href;
            if (name === 'data-course') return attrs['data-course'] || null;
            if (name === 'data-semester') return attrs['data-semester'] || null;
            if (name === 'data-code') return attrs['data-code'] || null;
            if (name === 'data-field') return attrs['data-field'] || null;
            if (name === 'data-graded') return attrs['data-graded'] || null;
            if (name === 'value') return this.value;
            if (name in this.attributes) return this.attributes[name];
            return null;
        },

        setAttribute(name, value) {
            this.attributes[name] = String(value);
            if (name === 'id') this.id = String(value);
            if (name === 'class') this.className = String(value);
            if (name === 'href') this.href = String(value);
            if (name === 'value') this.value = String(value);
            if (name.startsWith('data-')) {
                this.dataset[dataAttrKey(name)] = String(value);
            }
        },

        removeAttribute(name) {
            delete this.attributes[name];
            if (name === 'id') this.id = '';
            if (name === 'class') this.className = '';
            if (name === 'href') this.href = '';
            if (name === 'value') this.value = '';
            if (name.startsWith('data-')) {
                delete this.dataset[dataAttrKey(name)];
            }
        },

        hasAttribute(name) {
            return name in this.attributes;
        },

        getBoundingClientRect() {
            return { width: 100, height: 50, top: 100, left: 100 };
        },

        querySelector(selector) {
            return mockQuerySelector(this, selector);
        },
        querySelectorAll(selector) {
            return mockQuerySelectorAll(this, selector);
        },
        closest(selector) {
            let current = this;
            while (current) {
                if (matchesSelector(current, selector)) return current;
                current = current.parentNode;
            }
            return null;
        },
        contains(node) {
            if (node === this) return true;
            return (this.childNodes || []).some(child => child.contains ? child.contains(node) : child === node);
        },
        addEventListener(event, handler) {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(handler);
        },
        removeEventListener(event, handler) {
            if (!listeners[event]) return;
            const idx = listeners[event].indexOf(handler);
            if (idx >= 0) listeners[event].splice(idx, 1);
        },
        click() {
            (listeners['click'] || []).forEach(h => h({ target: this, currentTarget: this }));
        },
        focus() {},
        remove() {
            this._removed = true;
            if (this.parentNode) {
                const idx = this.parentNode.childNodes.indexOf(this);
                if (idx >= 0) this.parentNode.childNodes.splice(idx, 1);
            }
        },
        appendChild(child) {
            child.parentNode = this;
            this.childNodes.push(child);
            return child;
        },
        insertBefore(newNode, refNode) {
            newNode.parentNode = this;
            if (!refNode) {
                this.childNodes.push(newNode);
            } else {
                const idx = this.childNodes.indexOf(refNode);
                if (idx >= 0) {
                    this.childNodes.splice(idx, 0, newNode);
                } else {
                    this.childNodes.push(newNode);
                }
            }
            return newNode;
        },
        get classList() {
            return {
                contains: (cls) => (el.className || '').split(/\s+/).includes(cls),
                add: (cls) => {
                    if (!this.classList.contains(cls)) {
                        this.className = (this.className ? `${this.className} ` : '') + cls;
                    }
                },
                remove: (cls) => {
                    this.className = (this.className || '').split(/\s+/).filter(c => c && c !== cls).join(' ');
                },
            };
        },
        _listeners: listeners,
    };

    // 设置 dataset from attrs
    for (const key of Object.keys(attrs)) {
        if (key.startsWith('data-')) {
            el.dataset[dataAttrKey(key)] = attrs[key];
        }
    }

    // 设置 children 的 parentNode
    children.forEach(c => { c.parentNode = el; });

    return el;
}

/**
 * 创建一个完整的模拟浏览器环境
 */
function createMockEnv(options = {}) {
    const {
        url = 'https://jwxt.nwpu.edu.cn/student/home',
        elements = [],          // 预置的 DOM 元素
        isIframe = false,       // 是否模拟 iframe 内运行
        getCachedData = null,   // getCachedData 函数 mock
    } = options;

    const head = createElement('head', {});
    const body = createElement('body', {});
    const documentElement = createElement('html', {}, [head, body]);
    head.parentNode = documentElement;
    body.parentNode = documentElement;
    elements.forEach(el => body.appendChild(el));

    const gmStorage = {};
    const intervals = new Map();
    let nextIntervalId = 1;

    const parsedUrl = new URL(url);
    const locationObj = {
        href: url,
        host: parsedUrl.host,
        hostname: parsedUrl.hostname,
        origin: parsedUrl.origin,
        pathname: parsedUrl.pathname,
        search: parsedUrl.search,
        hash: parsedUrl.hash,
        protocol: parsedUrl.protocol,
        toString() {
            return this.href;
        },
        reload: jest.fn(),
    };

    const documentObj = {
        body,
        head,
        documentElement,
        readyState: 'complete',
        querySelector(selector) { return mockQuerySelector(documentElement, selector); },
        querySelectorAll(selector) { return mockQuerySelectorAll(documentElement, selector); },
        createElement(tag) { return createElement(tag); },
        getElementById(id) {
            const all = collectAll(documentElement);
            return all.find(el => el.id === id) || null;
        },
        addEventListener: jest.fn(),
    };

    const windowObj = {
        location: locationObj,
        document: documentObj,
        addEventListener: jest.fn(),
        setTimeout: jest.fn((fn) => fn()),
        setInterval: jest.fn((fn) => {
            const id = nextIntervalId++;
            intervals.set(id, fn);
            return id;
        }),
        clearInterval: jest.fn((id) => {
            intervals.delete(id);
        }),
        name: '',
        frameElement: null,
        scrollTo: jest.fn(),
        // MutationObserver mock
        MutationObserver: class {
            constructor(cb) { this._cb = cb; }
            observe() {}
            disconnect() {}
        },
    };

    // 模拟 top/self
    if (isIframe) {
        windowObj.self = windowObj;
        windowObj.top = {
            location: { href: 'https://jwxt.nwpu.edu.cn/student/home' },
            document: documentObj,
        };
    } else {
        windowObj.self = windowObj;
        windowObj.top = windowObj;
    }

    // GM_* API
    windowObj.GM_setValue = jest.fn((key, val) => { gmStorage[key] = val; });
    windowObj.GM_getValue = jest.fn((key, def) => (key in gmStorage ? gmStorage[key] : def));

    // Logger
    windowObj.Logger = {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };

    // CONSTANTS
    windowObj.CONSTANTS = {
        PAGE_TEACHER_SEARCH: 'https://teacher.nwpu.edu.cn/search/syss/.html',
        PAGE_COURSE_TABLE: 'https://jwxt.nwpu.edu.cn/student/for-std/course-table',
        COURSE_TABLE_CACHE_KEY: 'jwxt_course_table_cache',
        COURSE_TABLE_AUTO_FETCH_KEY: 'jwxt_auto_fetch_course_table',
        COURSE_TABLE_AUTO_FETCH_WINDOW_MS: 30000,
        COURSE_TABLE_CACHE_DELAY_MS: 1500,
        COURSE_TABLE_SEMESTER_BIND_DELAY_MS: 2000,
        COURSE_TABLE_SEMESTER_CACHE_DELAY_MS: 1000,
        COURSE_TABLE_OBSERVER_START_DELAY_MS: 2000,
        COURSE_TABLE_OBSERVER_TIMEOUT_MS: 60000,
        GPA_ESTIMATE_KEY: 'jwxt_gpa_estimate_data',
        TEACHER_SEARCH_NAME_KEY: 'gm_cross_search_name',
        TEACHER_SEARCH_RETRY_INTERVAL: 100,
        TEACHER_SEARCH_MAX_RETRIES: 300,
    };

    // getCachedData 函数 mock
    windowObj.getCachedData = options?.getCachedData || null;

    return { window: windowObj, document: documentObj, body, gmStorage, intervals };
}

/**
 * 在 vm 沙箱中执行函数源码
 */
function loadFunctionInEnv(env, funcSource, funcName, extraGlobals = {}, options = {}) {
    return runFunctionSourceInSandbox(env, funcSource, funcName, extraGlobals, options).fn;
}

// 读取源码
const SOURCE_CODE = fs.readFileSync(
    path.join(__dirname, '..', 'main.user.js'),
    'utf-8'
);

module.exports = {
    extractFunction,
    getFunctionStartLine,
    createElement,
    createMockEnv,
    loadFunctionInEnv,
    loadFunctionInWindow,
    loadFunctionInWindowContext,
    loadFunctionByName,
    loadFunctionByNameInCurrentContext,
    SOURCE_CODE,
};
