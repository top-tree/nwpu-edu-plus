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
    const regex = new RegExp(`^(function ${funcName}\\s*\\([^)]*\\)\\s*\\{)`, 'm');
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
    // 支持逗号分隔的多选择器：'a, button, span'
    if (selector.includes(',')) {
        return selector.split(',').some(s => matchesSelector(el, s.trim()));
    }
    // a[href*="xxx"]
    const attrContains = selector.match(/^(\w+)\[(\w+)\*="([^"]+)"\]$/);
    if (attrContains) {
        const [, tag, attr, val] = attrContains;
        return el.tagName === tag.toUpperCase() && (el.getAttribute(attr) || '').includes(val);
    }
    // a[data-text="xxx"]
    const attrExact = selector.match(/^(\w+)\[data-text="([^"]+)"\]$/);
    if (attrExact) {
        const [, tag, val] = attrExact;
        return el.tagName === tag.toUpperCase() && el.dataset.text === val;
    }
    // a[onclick*="xxx"]
    const onclickMatch = selector.match(/^(\w+)\[onclick\*="([^"]+)"\]$/);
    if (onclickMatch) {
        return false; // onclick 属性我们不模拟
    }
    // [role="xxx"]
    const roleMatch = selector.match(/^\[role="([^"]+)"\]$/);
    if (roleMatch) {
        return el.getAttribute && el.getAttribute('role') === roleMatch[1];
    }
    // .class
    if (selector.startsWith('.')) {
        return el.className.split(' ').includes(selector.slice(1));
    }
    // #id
    if (selector.startsWith('#')) {
        return el.id === selector.slice(1);
    }
    // tag
    if (/^\w+$/.test(selector)) {
        return el.tagName === selector.toUpperCase();
    }
    return false;
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
    const el = {
        tagName: tag.toUpperCase(),
        id: attrs.id || '',
        className: attrs.className || '',
        textContent: attrs.textContent || '',
        innerHTML: '',
        src: attrs.src || '',
        href: attrs.href || '',
        style: attrs.style || {},
        dataset: {},
        offsetParent: null,
        offsetHeight: 0,
        offsetWidth: 0,
        childNodes,
        parentNode: null,
        _removed: false,
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
            return attrs[name] || null;
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
        _listeners: listeners,
    };

    // 设置 dataset from attrs
    for (const key of Object.keys(attrs)) {
        if (key.startsWith('data-')) {
            el.dataset[key.replace('data-', '')] = attrs[key];
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

    const body = createElement('body', {});
    elements.forEach(el => body.appendChild(el));

    const gmStorage = {};

    const locationObj = { href: url };

    const documentObj = {
        body,
        readyState: 'complete',
        querySelector(selector) { return mockQuerySelector(body, selector); },
        querySelectorAll(selector) { return mockQuerySelectorAll(body, selector); },
        createElement(tag) { return createElement(tag); },
        getElementById(id) {
            const all = collectAll(body);
            return all.find(el => el.id === id) || null;
        },
        addEventListener: jest.fn(),
        head: { appendChild: jest.fn() },
    };

    const windowObj = {
        location: locationObj,
        document: documentObj,
        addEventListener: jest.fn(),
        setTimeout: jest.fn((fn) => fn()),
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
        PAGE_COURSE_TABLE: 'https://jwxt.nwpu.edu.cn/student/for-std/course-table',
        COURSE_TABLE_CACHE_KEY: 'jwxt_course_table_cache',
        GPA_ESTIMATE_KEY: 'jwxt_gpa_estimate_data',
    };

    // getCachedData 函数 mock
    windowObj.getCachedData = options?.getCachedData || null;

    return { window: windowObj, document: documentObj, body, gmStorage };
}

/**
 * 在 vm 沙箱中执行函数源码
 */
function loadFunctionInEnv(env, funcSource, funcName) {
    const sandbox = {
        ...env.window,
        window: env.window,
        document: env.document,
    };
    const code = `${funcSource}; _result = ${funcName};`;
    const context = vm.createContext(sandbox);
    vm.runInContext(code, context);
    return sandbox._result;
}

// 读取源码
const SOURCE_CODE = fs.readFileSync(
    path.join(__dirname, '..', 'main.user.js'),
    'utf-8'
);

module.exports = {
    extractFunction,
    createElement,
    createMockEnv,
    loadFunctionInEnv,
    SOURCE_CODE,
};
