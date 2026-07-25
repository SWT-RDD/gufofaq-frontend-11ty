module.exports = function (eleventyConfig) {
    // 圖片直接複製到 dist/images
    eleventyConfig.addPassthroughCopy({ "src/images": "images" });

    // i18n 翻譯檔（英文）直接複製到 dist/i18n，供 lang-toggle.js runtime fetch（非 build data，不碰 §2）
    eleventyConfig.addPassthroughCopy({ "src/i18n": "i18n" });

    // 元件 JS 逐一登記，複製到 dist/js
    eleventyConfig.addPassthroughCopy({
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
        "src/_includes/ui/pagination/pagination.js": "js/pagination.js",
        "src/_includes/components/pagination-input/pagination-input.js": "js/pagination-input.js",
        "src/_includes/ui/multi-select/multi-select.js": "js/multi-select.js",
        "src/_includes/ui/upload-box/upload-box.js": "js/upload-box.js",
        "src/_includes/components/editable-block/editable-block.js": "js/editable-block.js",
        "src/_includes/components/qa-side-panel/qa-side-panel.js": "js/qa-side-panel.js",
        "src/_includes/components/prompt-edit/prompt-edit.js": "js/prompt-edit.js",
        "src/_includes/components/faq-chatroom/faq-chatroom.js": "js/faq-chatroom.js",
        "src/_includes/components/select-dataset-modal/select-dataset-modal.js": "js/select-dataset-modal.js",
        "src/_includes/ui/list-filter/list-filter.js": "js/list-filter.js",
        "src/_includes/components/faq-feedback-modal/faq-feedback-modal.js": "js/faq-feedback-modal.js",
        "src/_includes/ui/toast/toast.js": "js/toast.js",
        "src/_includes/ui/collapse-text/collapse-text.js": "js/collapse-text.js",
        "src/_includes/ui/reveal-input/reveal-input.js": "js/reveal-input.js",
        "src/_includes/ui/theme-toggle/theme-toggle.js": "js/theme-toggle.js",
        "src/_includes/ui/lang-toggle/lang-toggle.js": "js/lang-toggle.js",
        "src/_includes/components/citation-ref/citation-ref.js": "js/citation-ref.js",
        "src/_includes/components/skill-try-sandbox/skill-try-sandbox.js": "js/skill-try-sandbox.js",
    });

    // 開發時 sass 另外編譯 dist/css，讓 eleventy --serve 監看 css 變動也即時重載
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
