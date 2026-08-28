// 文字編輯區：在「檢視」與「編輯」兩態之間切換（原生 DOM，不依賴框架）。
// 本檔只做視覺行為——進編輯態把輸入欄解禁、聚焦、游標移到末尾，離開時把值寫回 .display-text
// （純 DOM 層面）。**不含任何存檔／送出邏輯**：確認鈕按下去是真的送 API，那一段是業務層的事
// （閘門與結果 toast 宣告在元件 html 的 editCapability／editSaveToast）。
document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".editable-block").forEach(function (block) {
        initEditableBlock(block);
    });

    function initEditableBlock(block) {
        var displayText = block.querySelector(".display-text"); // 文字模式用（textarea 沒有）
        var editField = block.querySelector(".edit-field");
        var editIcon = block.querySelector(".edit-icon");
        var saveIcon = block.querySelector(".save-icon");
        var cancelIcon = block.querySelector(".cancel-icon");

        if (!editField || !editIcon || !saveIcon || !cancelIcon) return;

        var originalValue = displayText ? displayText.textContent : editField.value;

        function show(el) {
            if (el) el.style.display = "";
        }

        function hide(el) {
            if (el) el.style.display = "none";
        }

        // 單行 input 自動量寬：讓輸入框貼合目前文字的寬度，而不是一進編輯態就撐成整列
        function resizeInput(input) {
            var span = document.createElement("span");
            // absolute：append 目標可能是 flex/grid 容器（節點會被 blockify 拉伸，量到的寬就不是文字寬），
            // 而且量測節點不該在主流程裡生出一個行框。REACT-CONVERSION §④ 對這一族有明文規則，
            // 而這是全站唯一的實例——不照做的話，轉過去的人會抄到一份不符規則的範本。
            span.style.position = "absolute";
            span.style.top = "0";
            span.style.left = "-9999px";
            span.style.visibility = "hidden";
            span.style.whiteSpace = "pre";
            span.style.font = window.getComputedStyle(input).font;
            span.textContent = input.value;
            document.body.appendChild(span);
            var width = span.getBoundingClientRect().width;
            document.body.removeChild(span);

            var paddingLeft = parseFloat(window.getComputedStyle(input).paddingLeft);
            var paddingRight = parseFloat(window.getComputedStyle(input).paddingRight);

            input.style.width = width + paddingLeft + paddingRight + 2 + "px";
        }

        editIcon.addEventListener("click", function () {
            originalValue = displayText ? displayText.textContent : editField.value;

            hide(editIcon);
            show(saveIcon);
            show(cancelIcon);

            if (displayText) {
                resizeInput(editField);
                hide(displayText);
                editField.style.display = "inline-block";
            } else {
                show(editField);
            }

            editField.disabled = false;
            editField.classList.remove("disabled");

            editField.value = originalValue;
            editField.focus();

            setTimeout(function () {
                if (typeof editField.setSelectionRange === "function") {
                    var length = editField.value.length;
                    editField.setSelectionRange(length, length);
                }
            }, 0);
        });

        function exitEditMode() {
            hide(saveIcon);
            hide(cancelIcon);
            show(editIcon);

            if (displayText) {
                show(displayText);
                hide(editField);
            }

            editField.disabled = true;
            editField.classList.add("disabled");
        }

        function save() {
            var newValue = editField.value;

            if (displayText) {
                displayText.textContent = newValue;
            }

            editField.value = newValue;
            if (displayText) resizeInput(editField);
            exitEditMode();
        }

        function cancel() {
            editField.value = originalValue;
            if (displayText) resizeInput(editField);
            exitEditMode();
        }

        saveIcon.addEventListener("click", save);
        cancelIcon.addEventListener("click", cancel);

        var isComposing = false;
        editField.addEventListener("compositionstart", function () {
            isComposing = true;
        });
        editField.addEventListener("compositionend", function () {
            isComposing = false;
        });

        editField.addEventListener("keydown", function (e) {
            var isInput = editField.tagName === "INPUT";

            if (e.key === "Enter" && !isComposing) {
                if (isInput) {
                    e.preventDefault();
                    save();
                }
            }
            if (e.key === "Escape") {
                cancel();
            }
        });
    }
});
