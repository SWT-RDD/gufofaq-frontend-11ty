module.exports = function (eleventyConfig) {
    // 圖片：整個資料夾原樣複製到 dist/images。切版不做圖片處理（不壓縮、不轉檔、不產尺寸），
    // 頁面引用的路徑 `./images/xxx.png` 在原始碼與輸出兩邊長得一樣，看 markup 就知道會拿到哪張。
    eleventyConfig.addPassthroughCopy({ "src/images": "images" });

    // i18n 英文翻譯檔：整個資料夾複製到 dist/i18n，由 lang-toggle.js 在執行期 fetch 取用。
    // **是純資產，不是 eleventy 的 build data**——§2 的模板語法白名單明文禁止自訂 data 檔，
    // 而且烘進編譯期等於同一頁出兩份 HTML；這裡要的是同一份 HTML 在瀏覽器端換字。
    eleventyConfig.addPassthroughCopy({ "src/i18n": "i18n" });

    // 元件 JS：**逐一登記**，各自複製到 dist/js 的扁平檔名。
    // 不用萬用字元掃整個 _includes：那會把還沒接上頁面的實驗檔一起出貨，也讓「這個站到底載了哪些 js」
    // 從一份可讀的清單變成要跑一次 build 才知道。新增元件 js 就在這裡加一行（GUIDELINE §5）。
    eleventyConfig.addPassthroughCopy({
        "src/_includes/ui/clipboard/clipboard.js": "js/clipboard.js",
        "src/_includes/ui/scroll-lock/scroll-lock.js": "js/scroll-lock.js",
        "src/_includes/ui/slide-toggle/slide-toggle.js": "js/slide-toggle.js",
        "src/_includes/ui/print/print.js": "js/print.js",
        "src/_includes/ui/filter-fields/filter-fields.js": "js/filter-fields.js",
        "src/_includes/components/sources-block/sources-block.js": "js/sources-block.js",
        "src/_includes/components/chatroom/chatroom.js": "js/chatroom.js",
        "src/_includes/components/header/header.js": "js/header.js",
        "src/_includes/components/mobile-nav/mobile-nav.js": "js/mobile-nav.js",
        "src/_includes/ui/modals/modals.js": "js/modals.js",
        "src/_includes/ui/checkbox/checkbox.js": "js/checkbox.js",
        "src/_includes/ui/accordion/accordion.js": "js/accordion.js",
        "src/_includes/ui/tab/tab.js": "js/tab.js",
        "src/_includes/ui/table-sort/table-sort.js": "js/table-sort.js",
        "src/_includes/ui/pagination/pagination.js": "js/pagination.js",
        "src/_includes/components/pagination-input/pagination-input.js": "js/pagination-input.js",
        "src/_includes/ui/multi-select/multi-select.js": "js/multi-select.js",
        "src/_includes/ui/search-select/search-select.js": "js/search-select.js",
        "src/_includes/ui/upload-box/upload-box.js": "js/upload-box.js",
        "src/_includes/components/editable-block/editable-block.js": "js/editable-block.js",
        "src/_includes/components/qa-side-panel/qa-side-panel.js": "js/qa-side-panel.js",
        "src/_includes/components/prompt-edit/prompt-edit.js": "js/prompt-edit.js",
        "src/_includes/components/faq-chatroom/faq-chatroom.js": "js/faq-chatroom.js",
        "src/_includes/components/select-dataset-modal/select-dataset-modal.js": "js/select-dataset-modal.js",
        "src/_includes/components/search-scope-modal/search-scope-modal.js": "js/search-scope-modal.js",
        "src/_includes/ui/list-filter/list-filter.js": "js/list-filter.js",
        "src/_includes/components/rating-modal/rating-modal.js": "js/rating-modal.js",
        "src/_includes/ui/toast/toast.js": "js/toast.js",
        "src/_includes/ui/collapse-text/collapse-text.js": "js/collapse-text.js",
        "src/_includes/ui/dismiss-panel/dismiss-panel.js": "js/dismiss-panel.js",
        "src/_includes/ui/field-with-input/field-with-input.js": "js/field-with-input.js",
        "src/_includes/ui/reveal-input/reveal-input.js": "js/reveal-input.js",
        "src/_includes/ui/theme-toggle/theme-toggle.js": "js/theme-toggle.js",
        "src/_includes/ui/lang-toggle/lang-toggle.js": "js/lang-toggle.js",
        "src/_includes/components/citation-ref/citation-ref.js": "js/citation-ref.js",
        "src/_includes/components/skill-try-sandbox/skill-try-sandbox.js": "js/skill-try-sandbox.js",
        "src/_includes/components/builtin-tool-card/builtin-tool-card.js": "js/builtin-tool-card.js",
        "src/_includes/components/alias-entries-modal/alias-entries-modal.js": "js/alias-entries-modal.js",
        "src/_includes/components/import-report/import-report.js": "js/import-report.js",
    });

    // scss 不由 eleventy 編譯——另一支 sass 行程直接輸出到 dist/css。
    // 因為產物落在 eleventy 的輸出資料夾而不是 src，它不會自己察覺樣式變了，
    // 所以在這裡把 dist/css 加進 dev server 的監看清單，改 scss 才會即時重載。
    eleventyConfig.setServerOptions({
        watch: ["dist/css/**/*.css"],
    });

    return {
        dir: {
            input: "src",
            output: "dist",
            includes: "_includes",
        },
        templateFormats: ["html", "njk"],
        htmlTemplateEngine: "njk",
        markdownTemplateEngine: "njk",
    };
};
