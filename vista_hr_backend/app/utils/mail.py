"""
app/utils/mail.py
-----------------
Sends transactional emails via Gmail SMTP using Python stdlib smtplib.
No third-party library required.

.env keys needed:
    MAIL_SENDER=your_vistaHR_gmail@gmail.com
    MAIL_PASSWORD=your_16char_app_password   (Gmail App Password, no spaces)
"""

import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 465   # SSL


def _get_credentials():
    sender = os.getenv("MAIL_SENDER", "")
    password = os.getenv("MAIL_PASSWORD", "")
    if not sender or not password:
        raise RuntimeError(
            "Mail not configured. Set MAIL_SENDER and MAIL_PASSWORD in .env"
        )
    return sender, password


def send_email(to: str, subject: str, html_body: str, text_body: str = "") -> None:
    """
    Send an HTML email.  Raises on failure so callers can handle errors.
    text_body is optional plaintext fallback.
    """
    sender, password = _get_credentials()

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"VISTA-HR <{sender}>"
    msg["To"]      = to

    if text_body:
        msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    ctx = ssl.create_default_context()
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx) as server:
        server.login(sender, password)
        server.sendmail(sender, to, msg.as_string())


# ── Template helpers ──────────────────────────────────────────────────────────

def _base_template(title: str, body_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="520" cellpadding="0" cellspacing="0"
               style="background:#fff;border-radius:16px;
                      box-shadow:0 2px 12px rgba(0,0,0,.07);overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#1B3F6E;padding:28px 36px;">
              <p style="margin:0;font-size:22px;font-weight:800;
                        color:#fff;letter-spacing:-.3px;">
                VISTA<span style="font-weight:400;">-HR</span>
              </p>
              <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,.6);
                        letter-spacing:.04em;text-transform:uppercase;">
                Room &amp; Boarding House Rental
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 36px 28px;">
              {body_html}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 36px 28px;border-top:1px solid #f0f0f0;">
              <p style="margin:0;font-size:11px;color:#aaa;line-height:1.6;">
                This is an automated message from VISTA-HR. Please do not reply.<br/>
                &copy; 2025 VISTA-HR &mdash; Metro Manila Room Rental Platform
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def send_otp_email(to: str, otp: str, name: str = "") -> None:
    greeting = f"Hi {name}," if name else "Hi,"
    body = f"""
      <p style="margin:0 0 8px;font-size:15px;color:#111;font-weight:600;">{greeting}</p>
      <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.7;">
        Use the verification code below to confirm your email address.
        This code expires in <strong>10 minutes</strong>.
      </p>
      <div style="text-align:center;margin:0 0 28px;">
        <span style="display:inline-block;font-size:36px;font-weight:900;
                     letter-spacing:10px;color:#1B3F6E;background:#f0f4ff;
                     padding:16px 32px;border-radius:12px;
                     border:2px dashed #c7d7f5;">
          {otp}
        </span>
      </div>
      <p style="margin:0;font-size:13px;color:#888;">
        If you did not request this, you can safely ignore this email.
      </p>
    """
    html = _base_template("Email Verification — VISTA-HR", body)
    text = f"{greeting}\n\nYour VISTA-HR verification code is: {otp}\n\nExpires in 10 minutes."
    send_email(to, "Your VISTA-HR Verification Code", html, text)


def send_kyc_approved_email(to: str, name: str = "") -> None:
    greeting = f"Hi {name}," if name else "Hi,"
    body = f"""
      <p style="margin:0 0 8px;font-size:15px;color:#111;font-weight:600;">{greeting}</p>
      <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.7;">
        Great news! Your identity has been verified. Your property owner account is now
        <strong style="color:#15803d;">fully approved</strong>.
      </p>
      <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.7;">
        You can now publish your listings and they will be visible to residents across Metro Manila.
      </p>
      <div style="text-align:center;">
        <a href="http://127.0.0.1:5500/Property-Owner/dashboard/property-owner-dashboard.html"
           style="display:inline-block;background:#1B3F6E;color:#fff;font-size:14px;
                  font-weight:700;padding:13px 28px;border-radius:10px;text-decoration:none;">
          Go to Dashboard
        </a>
      </div>
    """
    html = _base_template("Account Approved — VISTA-HR", body)
    text = f"{greeting}\n\nYour VISTA-HR account has been approved. You can now publish listings."
    send_email(to, "Your VISTA-HR Account is Approved", html, text)


def send_kyc_rejected_email(to: str, reason: str, name: str = "") -> None:
    greeting = f"Hi {name}," if name else "Hi,"
    reason_html = f"""
      <div style="background:#fef2f2;border-left:4px solid #ef4444;
                  border-radius:8px;padding:14px 16px;margin:0 0 20px;">
        <p style="margin:0;font-size:13px;color:#991b1b;line-height:1.6;">
          <strong>Reason:</strong> {reason}
        </p>
      </div>
    """ if reason else ""
    body = f"""
      <p style="margin:0 0 8px;font-size:15px;color:#111;font-weight:600;">{greeting}</p>
      <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.7;">
        Unfortunately, your identity verification was not approved at this time.
      </p>
      {reason_html}
      <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.7;">
        Please re-submit your documents with clearer photos and try again.
        If you believe this is an error, contact our support team.
      </p>
    """
    html = _base_template("Verification Update — VISTA-HR", body)
    text = f"{greeting}\n\nYour VISTA-HR KYC was not approved.\nReason: {reason}\n\nPlease re-submit."
    send_email(to, "Action Required — VISTA-HR Verification", html, text)


def send_student_approved_email(to: str, name: str = "") -> None:
    greeting = f"Hi {name}," if name else "Hi,"
    body = f"""
      <p style="margin:0 0 8px;font-size:15px;color:#111;font-weight:600;">{greeting}</p>
      <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.7;">
        Your student status has been <strong style="color:#15803d;">verified</strong>!
        You are now eligible for student discounts on participating listings.
      </p>
    """
    html = _base_template("Student Verified — VISTA-HR", body)
    text = f"{greeting}\n\nYour student status has been verified on VISTA-HR."
    send_email(to, "Student Verification Approved — VISTA-HR", html, text)


def send_student_rejected_email(to: str, reason: str, name: str = "") -> None:
    greeting = f"Hi {name}," if name else "Hi,"
    reason_html = f"""
      <div style="background:#fef2f2;border-left:4px solid #ef4444;
                  border-radius:8px;padding:14px 16px;margin:0 0 20px;">
        <p style="margin:0;font-size:13px;color:#991b1b;line-height:1.6;">
          <strong>Reason:</strong> {reason}
        </p>
      </div>
    """ if reason else ""
    body = f"""
      <p style="margin:0 0 8px;font-size:15px;color:#111;font-weight:600;">{greeting}</p>
      <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.7;">
        Your student verification was not approved. Please re-submit with clearer documents.
      </p>
      {reason_html}
    """
    html = _base_template("Student Verification Update — VISTA-HR", body)
    text = f"{greeting}\n\nYour student verification was not approved.\nReason: {reason}"
    send_email(to, "Action Required — Student Verification", html, text)

def send_password_reset_email(to: str, otp: str, name: str = "") -> None:
    greeting = f"Hi {name}," if name else "Hi,"
    body = f"""
      <p style="margin:0 0 8px;font-size:15px;color:#111;font-weight:600;">{greeting}</p>
      <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.7;">
        We received a request to reset your VISTA-HR password.
        Use the code below — it expires in <strong>10 minutes</strong>.
      </p>
      <div style="text-align:center;margin:0 0 28px;">
        <span style="display:inline-block;font-size:36px;font-weight:900;
                     letter-spacing:10px;color:#1B3F6E;background:#f0f4ff;
                     padding:16px 32px;border-radius:12px;
                     border:2px dashed #c7d7f5;">
          {otp}
        </span>
      </div>
      <p style="margin:0 0 16px;font-size:13px;color:#888;">
        If you did not request a password reset, you can safely ignore this email.
        Your password will not change.
      </p>
    """
    html = _base_template("Password Reset — VISTA-HR", body)
    text = f"{greeting}\n\nYour VISTA-HR password reset code is: {otp}\n\nExpires in 10 minutes."
    send_email(to, "Reset Your VISTA-HR Password", html, text)