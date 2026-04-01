const {
    createMockEnv,
    createElement,
    loadFunctionByName,
    SOURCE_CODE,
} = require('./setup');

function loadHelper(env, name, globals = {}) {
    const sandbox = {
        ...env.window,
        window: env.window,
        document: env.document,
        location: env.window.location,
        Logger: env.window.Logger,
        GM_getValue: env.window.GM_getValue,
        GM_setValue: env.window.GM_setValue,
        MutationObserver: env.window.MutationObserver,
        CONSTANTS: env.window.CONSTANTS,
        setTimeout: env.window.setTimeout,
        clearTimeout: env.window.clearTimeout,
        ...globals,
    };
    const fn = loadFunctionByName(SOURCE_CODE, name, sandbox, globals);
    expect(fn).not.toBeNull();
    return fn;
}

describe('课表 helper', () => {
    test('consumeCourseTableAutoFetchFlag 在有效窗口内会清空标记并返回真值', () => {
        const env = createMockEnv();
        const fn = loadHelper(env, 'consumeCourseTableAutoFetchFlag');
        const flagTime = Date.now() - 500;
        env.gmStorage['jwxt_auto_fetch_course_table'] = flagTime;

        const result = fn.call(env.window, flagTime + 1000);

        expect(result).toBe(true);
        expect(env.gmStorage['jwxt_auto_fetch_course_table']).toBe(0);
        expect(env.window.Logger.log).toHaveBeenCalledWith(
            '课表缓存',
            expect.stringContaining('自动获取标记')
        );
    });

    test('consumeCourseTableAutoFetchFlag 过期后不会清空标记', () => {
        const env = createMockEnv();
        const fn = loadHelper(env, 'consumeCourseTableAutoFetchFlag');
        const flagTime = Date.now() - 40000;
        env.gmStorage['jwxt_auto_fetch_course_table'] = flagTime;

        const result = fn.call(env.window, flagTime + 40001);

        expect(result).toBe(false);
        expect(env.gmStorage['jwxt_auto_fetch_course_table']).toBe(flagTime);
    });

    test('scheduleCourseTableCache 会按指定延迟调度缓存', () => {
        const env = createMockEnv();
        const cacheCourseTableData = jest.fn();
        const fn = loadHelper(env, 'scheduleCourseTableCache', { cacheCourseTableData });

        fn.call(env.window, 750);

        expect(env.window.setTimeout).toHaveBeenCalledWith(expect.any(Function), 750);
        expect(cacheCourseTableData).toHaveBeenCalledTimes(1);
    });

    test('initializeCourseTableCacheOnLoad 在 complete 时直接调度缓存', () => {
        const env = createMockEnv();
        const cacheCourseTableData = jest.fn();
        const scheduleCourseTableCache = jest.fn();
        const fn = loadHelper(env, 'initializeCourseTableCacheOnLoad', {
            scheduleCourseTableCache,
            cacheCourseTableData,
        });

        fn.call(env.window);

        expect(scheduleCourseTableCache).toHaveBeenCalledTimes(1);
        expect(env.window.addEventListener).not.toHaveBeenCalled();
    });

    test('initializeCourseTableCacheOnLoad 在 loading 时监听 load 事件', () => {
        const env = createMockEnv();
        Object.defineProperty(env.document, 'readyState', { value: 'loading', configurable: true });
        const scheduleCourseTableCache = jest.fn();
        const fn = loadHelper(env, 'initializeCourseTableCacheOnLoad', {
            scheduleCourseTableCache,
        });

        fn.call(env.window);

        expect(env.window.addEventListener).toHaveBeenCalledWith('load', expect.any(Function));
    });

    test('initializeCourseTableSemesterWatcher 会在学期切换后重新缓存', () => {
        const semesterSelect = createElement('select', { id: 'semester-select' });
        const env = createMockEnv({
            elements: [semesterSelect],
        });
        const cacheCourseTableData = jest.fn();
        const fn = loadHelper(env, 'initializeCourseTableSemesterWatcher', { cacheCourseTableData });

        fn.call(env.window);

        expect(semesterSelect._listeners.change).toHaveLength(1);
        semesterSelect._listeners.change[0]();
        expect(cacheCourseTableData).toHaveBeenCalledTimes(1);
    });

    test('initializeCourseTableClickWatcher 会监听按钮点击并安排缓存', () => {
        const button = createElement('button', { textContent: '全部课程' });
        const env = createMockEnv({ elements: [button] });
        const cacheCourseTableData = jest.fn();
        const scheduleCourseTableCache = jest.fn(() => cacheCourseTableData());
        const fn = loadHelper(env, 'initializeCourseTableClickWatcher', { scheduleCourseTableCache });

        fn.call(env.window);

        expect(env.document.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
        const clickHandler = env.document.addEventListener.mock.calls[0][1];
        clickHandler({ target: button });
        expect(scheduleCourseTableCache).toHaveBeenCalledTimes(1);
        expect(cacheCourseTableData).toHaveBeenCalledTimes(1);
    });

    test('startCourseTableLessonObserver 命中 lessonInfo 后只处理一次', () => {
        const lessonInfo = createElement('tr', { className: 'lessonInfo' });
        const env = createMockEnv({
            elements: [lessonInfo],
        });
        let observerInstance = null;
        env.window.MutationObserver = class {
            constructor(cb) {
                this.cb = cb;
                this.observe = jest.fn();
                this.disconnect = jest.fn();
                observerInstance = this;
            }
        };
        const cacheCourseTableData = jest.fn();
        const showAutoFetchSuccessToast = jest.fn();
        const fn = loadHelper(env, 'startCourseTableLessonObserver', {
            cacheCourseTableData,
            showAutoFetchSuccessToast,
        });

        fn.call(env.window, true);
        observerInstance.cb([{ type: 'childList' }]);
        observerInstance.cb([{ type: 'childList' }]);

        expect(cacheCourseTableData).toHaveBeenCalledTimes(1);
        expect(showAutoFetchSuccessToast).toHaveBeenCalledTimes(1);
        expect(observerInstance.disconnect).toHaveBeenCalled();
    });
});
