// Android test sign-up popup. "Send" posts the email to the owner's Google Form, then thanks them.
// If scripts are off, the button falls back to a plain email to support.
(() => {
    const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLScp1d5lw-mys2N_0vDiFgy27GSbYIYj91CyBiBjGjM-ohYwTw/formResponse";
    const EMAIL_FIELD = "entry.1089706631";

    const button = document.getElementById("android-test-button");
    const dialog = document.getElementById("android-test");
    const form = document.getElementById("android-test-form");
    const email = document.getElementById("android-test-email");
    const label = document.getElementById("android-test-label");
    const send = form && form.querySelector(".test-dialog-send");
    const thanks = document.getElementById("android-test-thanks");
    const error = document.getElementById("android-test-error");
    if (!button || !dialog || typeof dialog.showModal !== "function") return;

    button.addEventListener("click", (event) => {
        event.preventDefault();
        thanks.hidden = true;
        error.hidden = true;
        label.hidden = false;
        email.hidden = false;
        send.hidden = false;
        send.disabled = false;
        dialog.showModal();
        email.focus();
    });

    dialog.querySelector(".test-dialog-close").addEventListener("click", () => dialog.close());

    // A tap outside the card closes it.
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!email.checkValidity()) return;
        send.disabled = true;
        error.hidden = true;
        const data = new FormData();
        data.append(EMAIL_FIELD, email.value.trim());
        try {
            // Google Forms doesn't allow reading the reply from another site ("no-cors"),
            // so a request that reaches Google counts as sent.
            await fetch(FORM_URL, { method: "POST", mode: "no-cors", body: data });
            email.value = "";
            label.hidden = true;
            email.hidden = true;
            send.hidden = true;
            thanks.hidden = false;
        } catch {
            send.disabled = false;
            error.hidden = false;
        }
    });
})();
