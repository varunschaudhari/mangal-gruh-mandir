# Adding the online Mahaprasad page to the trust's Razorpay account

Use the Razorpay **web dashboard** on a computer, logged in as the trust:
Account & Settings → Business website detail → **Add additional website/app details**.

> Do **not** use "Update website/app details". That changes the main website
> (`mangalagrahmandir.in`), which the NGOGuru website needs to keep taking payments.
> Never press "Regenerate" on the API key either.

## What to enter

| Field | Value |
|---|---|
| Website | https://mandir.aumora.io/prasad |
| About us | https://mandir.aumora.io/about |
| Contact us | https://mandir.aumora.io/about (the Contact section) |
| Pricing | https://mandir.aumora.io/pricing |
| Terms and conditions | https://mandir.aumora.io/terms |
| Privacy policy | https://mandir.aumora.io/privacy |
| Cancellation / refund policy | https://mandir.aumora.io/refund |
| Sample invoice | `sample-invoice-mahaprasad.pdf` (this folder) |

The pages must already be live on the server, so deploy before submitting.

## Reason for the new website (Razorpay asks for at least 50 words)

> Shri Mangal Grah Mandir, Amalner is managed by Mangalgrah Seva Sanstha, Amalner (Public Trust Reg.
> No. F-13350/Jalgaon). On this website, part of the temple's management system hosted for the trust
> by its software provider Ashaparth AI, devotees buy Mahaprasad (temple meal) coupons for a chosen
> day. They pay by UPI, card or net banking. The coupon QR code is sent to the devotee's mobile and
> scanned at the temple's Mahaprasad hall. Our main website, mangalagrahmandir.in, continues to
> take pooja bookings and donations through this same account.

## If the option is missing

Razorpay offers "Add additional website" only to accounts in the e-commerce business category. If
it doesn't appear, write to Razorpay support from the trust's registered email. Ask them to add
`mandir.aumora.io` as an additional website for online Mahaprasad coupon sales, and attach the
details above.
