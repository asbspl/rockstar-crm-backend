const Order = require("../models/order.model");

function sendError(res, error, fallback = "Order request failed.") {
    console.error("[Orders API Error]", {
        message: error?.message,
        code: error?.code,
        detail: error?.detail,
        constraint: error?.constraint,
        table: error?.table,
        column: error?.column,
        stack: error?.stack,
    });

    const status = Number(error?.statusCode) || 500;

    return res.status(status).json({
        success: false,
        message: status >= 500 ? fallback : error.message,
        ...(process.env.NODE_ENV !== "production" && status >= 500
            ? { debug: error?.message || "Unknown server error." }
            : {}),
    });
}

function parseRequestBody(req) {
    const body = { ...(req.body || {}) };
    if (typeof body.items === "string") {
        try { body.items = JSON.parse(body.items); } catch { /* model returns a validation error */ }
    }
    return body;
}

async function getOrders(req, res) {
    try {
        const result = await Order.getOrders({
            page: req.query.page,
            limit: req.query.limit,
            search: req.query.search,
            status: req.query.status,
            dispatch: req.query.dispatch,
        });
        return res.json({ success: true, data: result.data, pagination: result.pagination });
    } catch (error) {
        return sendError(res, error, "Unable to load orders.");
    }
}

async function getOrder(req, res) {
    try {
        const order = await Order.getOrder(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: "Order not found." });
        return res.json({ success: true, data: order });
    } catch (error) {
        return sendError(res, error, "Unable to load order details.");
    }
}

async function createOrder(req, res) {
    try {
        const order = await Order.saveOrder(parseRequestBody(req), req.files || {});
        return res.status(201).json({ success: true, message: "Order created successfully.", data: order });
    } catch (error) {
        return sendError(res, error, "Unable to create order.");
    }
}

async function updateOrder(req, res) {
    try {
        const order = await Order.saveOrder(parseRequestBody(req), req.files || {}, req.params.id);
        return res.json({ success: true, message: "Order updated successfully.", data: order });
    } catch (error) {
        return sendError(res, error, "Unable to update order.");
    }
}

async function deleteOrder(req, res) {
    try {
        await Order.deleteOrder(req.params.id);
        return res.json({ success: true, message: "Order deleted successfully." });
    } catch (error) {
        return sendError(res, error, "Unable to delete order.");
    }
}

async function updateOrderStatus(req, res) {
    try {
        const order = await Order.updateOrderStatus(req.params.id, req.body?.status);
        return res.json({ success: true, message: "Order status updated successfully.", data: order });
    } catch (error) {
        return sendError(res, error, "Unable to update order status.");
    }
}

async function saveDispatch(req, res) {
    try {
        const order = await Order.saveDispatch(req.params.id, req.body || {});
        return res.json({ success: true, message: "Dispatch details saved successfully.", data: order });
    } catch (error) {
        return sendError(res, error, "Unable to save dispatch details.");
    }
}



async function sendEmail(req, res) {

    try {
        const order = await Order.getOrder(req.params.id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found."
            });
        }

        const type = String(req.body?.type || "PI").toUpperCase();

        if (!["PI", "DC"].includes(type)) {
            return res.status(400).json({
                success: false,
                message: "Document type must be PI or DC."
            });
        }

        // Send to the selected client's email first.
        const to = String(
            order.client_email || order.customer_email || ""
        ).trim();

        if (!to) {
            return res.status(422).json({
                success: false,
                message: "Selected client email is missing. Please update the client email address."
            });
        }

        // SMTP configuration
        const smtpHost = process.env.SMTP_HOST;
        const smtpPort = Number(process.env.SMTP_PORT || 587);
        const smtpUser = process.env.SMTP_USER;

        // Support both environment variable names.
        const smtpPass = String(
            process.env.SMTP_PASS ||
            process.env.SMTP_APP_PASSWORD ||
            ""
        ).trim().replace(/\s/g, "");

        const mailFrom =
            process.env.MAIL_FROM || smtpUser;

        if (!smtpHost || !smtpUser || !smtpPass) {
            return res.status(503).json({
                success: false,
                message: "SMTP is not configured. Check SMTP_HOST, SMTP_USER and SMTP_PASS or SMTP_APP_PASSWORD in backend .env."
            });
        }

        if (!Number.isInteger(smtpPort) || smtpPort <= 0) {
            return res.status(503).json({
                success: false,
                message: "Invalid SMTP_PORT configuration."
            });
        }

        let nodemailer;

        try {
            nodemailer = require("nodemailer");
        } catch {
            return res.status(503).json({
                success: false,
                message: "Nodemailer is missing. Run npm install nodemailer."
            });
        }

        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: String(process.env.SMTP_SECURE || "false") === "true",
            auth: {
                user: smtpUser,
                pass: smtpPass
            }
        });

        const isPI = type === "PI";

        const docNo = isPI
            ? order.pino
            : (order.dcsno || order.dispatch_sequence_no || "Pending");

        const siteName = String(
            order.customer_site_name || "Customer Site"
        ).trim();

        const emailSubject = `${isPI ? "Proforma Invoice" : "Delivery Challan"
            } - ${siteName}`;

        const documentHtml = String(req.body?.document_html || "");

        if (!documentHtml || documentHtml.length > 1500000) {
            return res.status(422).json({
                success: false,
                message: "Print-ready document is missing or too large. Preview the document again."
            });
        }

        // Escape HTML content
        const escapeHtml = (value) =>
            String(value ?? "").replace(/[&<>"']/g, (char) => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            })[char]);

        const lines = (order.items || []).map((item) => `
    <tr>
        <td>${escapeHtml(item.product_name)}</td>
        <td>${Number(item.quantity || 0)}</td>
        ${isPI ? `
            <td>₹ ${Number(item.amount || 0).toFixed(2)}</td>
        ` : ""}
    </tr>
`).join("");

        const amountColumn = isPI ? "<th>Amount</th>" : "";

        const emailHtml = `
    <div style="font-family:Arial,sans-serif;color:#172033;">
        <h2>${isPI ? "Proforma Invoice" : "Delivery Challan"} ${escapeHtml(docNo)}</h2>

        <p>Dear Customer,</p>

        <p>Please find attached your
            ${isPI ? "Proforma Invoice" : "Delivery Challan"}.
        </p>

        <p>
            <b>Company:</b> ${escapeHtml(order.company_name)}<br>
            <b>Client:</b> ${escapeHtml(order.client_name)}<br>
            <b>Customer:</b> ${escapeHtml(order.customer_name)}<br>
            <b>Site:</b> ${escapeHtml(order.customer_site_name)}
        </p>

        <table cellpadding="8" cellspacing="0" border="1"
            style="border-collapse:collapse;width:100%;">

            <thead>
                <tr>
                    <th>Product</th>
                    <th>Quantity</th>
                    ${amountColumn}
                </tr>
            </thead>

            <tbody>
                ${lines}
            </tbody>
        </table>

        ${isPI ? `
            <p>
                <b>Total Amount:</b>
                ₹ ${Number(order.grand_total || 0).toFixed(2)}
            </p>
        ` : ""}

        <p>
            Regards,<br>
            ${escapeHtml(order.company_name)}
        </p>
    </div>
`;
        // Generate PDF attachment
        const puppeteer = require("puppeteer");

        let browser;
        let documentPdf;

        try {
            browser = await puppeteer.launch({
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"]
            });

            const page = await browser.newPage();

            await page.setContent(documentHtml, {
                waitUntil: "networkidle0",
                timeout: 60000
            });

            documentPdf = await page.pdf({
                format: "A4",
                printBackground: true,
                preferCSSPageSize: true
            });

        } finally {
            if (browser) {
                await browser.close();
            }
        }

        // Send email
        const info = await transporter.sendMail({

            from: mailFrom,
            to,
            subject: emailSubject,
            html: emailHtml,

            attachments: [
                {
                    filename: `${String(docNo).replace(/[^a-z0-9_-]/gi, "_")}.pdf`,
                    content: documentPdf,
                    contentType: "application/pdf"
                }
            ]
        });

        console.log("[Orders Email] Successfully sent:", {
            orderId: req.params.id,
            document: type,
            recipient: to,
            messageId: info.messageId
        });

        return res.json({
            success: true,
            message: `Email sent successfully to ${to}.`,
            data: {
                messageId: info.messageId,
                to,
                document: type
            }
        });

    } catch (error) {
        console.error("[Orders Email Error]", {
            message: error.message,
            code: error.code,
            response: error.response
        });

        return sendError(
            res,
            error,
            "Unable to send order document email."
        );
    }
}


module.exports = { getOrders, getOrder, createOrder, updateOrder, deleteOrder, updateOrderStatus, changeStatus: updateOrderStatus, saveDispatch, sendEmail };
