/**
 * navigateToCourseTablePage 函数测试
 * 
 * 核心测试场景：
 * 1. 优先通过菜单栏链接跳转（保留 iframe 框架）
 * 2. 菜单栏找不到时，通过内容 iframe 的 src 跳转
 * 3. 最终兜底：直接修改 window.location.href
 * 4. 已在课表页面时直接点击"全部课程"
 */

const { createMockEnv, createElement, extractFunction, loadFunctionInEnv, SOURCE_CODE } = require('./setup');

// 提取函数源码
const funcSource = extractFunction(SOURCE_CODE, 'navigateToCourseTablePage');

describe('navigateToCourseTablePage', () => {

    test('源码提取成功', () => {
        expect(funcSource).not.toBeNull();
        expect(funcSource).toContain('navigateToCourseTablePage');
        expect(funcSource).toContain('courseTableLink');
    });

    test('策略1：找到菜单栏 <a href=".../course-table"> 链接时应点击它', () => {
        const menuLink = createElement('a', {
            id: 'menu-link',
            href: '/student/for-std/course-table',
        });
        const clickSpy = jest.fn();
        menuLink.addEventListener('click', clickSpy);

        const env = createMockEnv({
            url: 'https://jwxt.nwpu.edu.cn/student/home',
            elements: [menuLink],
        });

        const fn = loadFunctionInEnv(env, funcSource, 'navigateToCourseTablePage');
        fn.call(env.window);

        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(env.window.Logger.log).toHaveBeenCalledWith('课表获取', '找到菜单链接，通过点击导航跳转');
        // location 不应被修改为课表 URL
        expect(env.window.location.href).toBe('https://jwxt.nwpu.edu.cn/student/home');
    });

    test('策略1：通过 data-text="我的课表" 匹配菜单链接', () => {
        const menuLink = createElement('a', {
            id: 'dt-link',
            href: '#',
            'data-text': '我的课表',
        });
        const clickSpy = jest.fn();
        menuLink.addEventListener('click', clickSpy);

        const env = createMockEnv({
            url: 'https://jwxt.nwpu.edu.cn/student/home',
            elements: [menuLink],
        });

        const fn = loadFunctionInEnv(env, funcSource, 'navigateToCourseTablePage');
        fn.call(env.window);

        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(env.window.Logger.log).toHaveBeenCalledWith('课表获取', '找到菜单链接，通过点击导航跳转');
    });

    test('策略2：菜单链接不存在 + 有内容 iframe → 修改 iframe src', () => {
        const contentIframe = createElement('iframe', {
            id: 'content-frame',
            src: '/student/for-std/student-portrait',
        });
        contentIframe.tagName = 'IFRAME';
        contentIframe.offsetParent = {}; // 非 null 即可
        contentIframe.offsetHeight = 600;
        contentIframe.offsetWidth = 1000;

        const env = createMockEnv({
            url: 'https://jwxt.nwpu.edu.cn/student/home',
            elements: [contentIframe],
        });

        const fn = loadFunctionInEnv(env, funcSource, 'navigateToCourseTablePage');
        fn.call(env.window);

        expect(contentIframe.src).toContain('/student/for-std/course-table');
        expect(env.window.Logger.log).toHaveBeenCalledWith('课表获取', '通过修改内容 iframe src 跳转');
    });

    test('策略2：应跳过 gm_ 前缀的插件 iframe', () => {
        const gmIframe = createElement('iframe', {
            id: 'gm_bg_sync_frame',
            src: '/somewhere',
        });
        gmIframe.tagName = 'IFRAME';
        gmIframe.offsetParent = {};
        gmIframe.offsetHeight = 600;
        gmIframe.offsetWidth = 1000;

        const realIframe = createElement('iframe', {
            id: 'real-content',
            src: '/student/for-std/student-portrait',
        });
        realIframe.tagName = 'IFRAME';
        realIframe.offsetParent = {};
        realIframe.offsetHeight = 600;
        realIframe.offsetWidth = 1000;

        const env = createMockEnv({
            url: 'https://jwxt.nwpu.edu.cn/student/home',
            elements: [gmIframe, realIframe],
        });

        const fn = loadFunctionInEnv(env, funcSource, 'navigateToCourseTablePage');
        fn.call(env.window);

        expect(gmIframe.src).not.toContain('/student/for-std/course-table');
        expect(realIframe.src).toContain('/student/for-std/course-table');
    });

    test('策略3：菜单和 iframe 都找不到 → 兜底修改 location.href', () => {
        const env = createMockEnv({
            url: 'https://jwxt.nwpu.edu.cn/student/home',
            elements: [],
        });

        const fn = loadFunctionInEnv(env, funcSource, 'navigateToCourseTablePage');
        fn.call(env.window);

        expect(env.window.location.href).toBe('https://jwxt.nwpu.edu.cn/student/for-std/course-table');
        expect(env.window.Logger.warn).toHaveBeenCalledWith(
            '课表获取',
            expect.stringContaining('直接跳转')
        );
    });

    test('已在课表页面时，应点击"全部课程"按钮而不跳转', () => {
        const allCoursesBtn = createElement('a', {
            id: 'all-courses',
            textContent: '全部课程',
        });
        const clickSpy = jest.fn();
        allCoursesBtn.addEventListener('click', clickSpy);

        const overlay = createElement('div', { className: 'gpa-report-overlay' });

        const env = createMockEnv({
            url: 'https://jwxt.nwpu.edu.cn/student/for-std/course-table',
            elements: [allCoursesBtn, overlay],
        });

        const fn = loadFunctionInEnv(env, funcSource, 'navigateToCourseTablePage');
        fn.call(env.window);

        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(env.window.Logger.log).toHaveBeenCalledWith(
            '课表获取',
            expect.stringContaining('已在课表页面')
        );
    });

    test('跳转时应设置 auto_fetch 时间戳标记', () => {
        const menuLink = createElement('a', { href: '/student/for-std/course-table' });
        const env = createMockEnv({
            url: 'https://jwxt.nwpu.edu.cn/student/home',
            elements: [menuLink],
        });

        const fn = loadFunctionInEnv(env, funcSource, 'navigateToCourseTablePage');
        const before = Date.now();
        fn.call(env.window);
        const after = Date.now();

        const flag = env.gmStorage['jwxt_auto_fetch_course_table'];
        expect(flag).toBeGreaterThanOrEqual(before);
        expect(flag).toBeLessThanOrEqual(after);
    });

    test('跳转时应移除 GPA 预测弹窗', () => {
        const overlay = createElement('div', { className: 'gpa-report-overlay' });
        const menuLink = createElement('a', { href: '/student/for-std/course-table' });

        const env = createMockEnv({
            url: 'https://jwxt.nwpu.edu.cn/student/home',
            elements: [menuLink, overlay],
        });

        const fn = loadFunctionInEnv(env, funcSource, 'navigateToCourseTablePage');
        fn.call(env.window);

        expect(overlay._removed).toBe(true);
    });
});
