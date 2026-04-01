const {
    SOURCE_CODE,
    createMockEnv,
    loadFunctionByName,
} = require('./setup');

function loadTopLevelFunction(env, funcName, extraGlobals = {}) {
    const loaded = loadFunctionByName(SOURCE_CODE, funcName, env, extraGlobals, true);
    expect(loaded).not.toBeNull();
    return loaded.fn;
}

describe('更新下载 fallback', () => {
    test('buildGreasyForkFallbackUrls 会生成与检查更新一致的三段回退链', () => {
        const env = createMockEnv();
        const fn = loadTopLevelFunction(env, 'buildGreasyForkFallbackUrls');
        const urls = fn('https://example.com/script.user.js');

        expect(urls).toEqual([
            'https://example.com/script.user.js',
            'https://api.codetabs.com/v1/proxy?quest=https%3A%2F%2Fexample.com%2Fscript.user.js',
            'https://api.allorigins.win/raw?url=https%3A%2F%2Fexample.com%2Fscript.user.js',
        ]);
    });

    test('downloadUserscriptWithFallback 会在 codetabs 失败后继续尝试 allorigins', () => {
        const env = createMockEnv();
        const requests = [];
        env.window.GM_xmlhttpRequest = jest.fn((options) => {
            requests.push(options);
        });

        const buildUrls = loadTopLevelFunction(env, 'buildGreasyForkFallbackUrls');
        const requestTextWithFallback = loadTopLevelFunction(env, 'requestTextWithFallback');
        const downloadUserscriptWithFallback = loadTopLevelFunction(env, 'downloadUserscriptWithFallback', {
            buildGreasyForkFallbackUrls: buildUrls,
            requestTextWithFallback,
        });

        const onSuccess = jest.fn();
        const onFailure = jest.fn();

        downloadUserscriptWithFallback('https://example.com/script.user.js', {
            onSuccess,
            onFailure,
        });

        expect(requests).toHaveLength(1);
        expect(requests[0].url).toBe('https://example.com/script.user.js');

        requests[0].onerror();
        expect(requests).toHaveLength(2);
        expect(requests[1].url).toContain('api.codetabs.com');

        requests[1].onerror();
        expect(requests).toHaveLength(3);
        expect(requests[2].url).toContain('api.allorigins.win');

        requests[2].onload({ status: 200, responseText: '// ==UserScript==\n// ==/UserScript==' });

        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(onFailure).not.toHaveBeenCalled();
    });

    test('更新弹窗下载按钮走 fallback 下载函数', () => {
        expect(SOURCE_CODE).toContain('downloadUserscriptWithFallback(scriptUrl');
    });
});
