# Shopify Admin API Setup (Fulfillment Orders)

If you see this error:

```
Shopify API Error (get fulfillment orders): {"errors":"The api_client does not have the required permission(s)."}
```

your Admin API access token is missing the **fulfillment order** scopes.

## Fix: Add required scopes

1. In **Shopify Admin**, go to **Settings** → **Apps and sales channels** → **Develop apps**.
2. Open your app (or create a **Custom app**).
3. Go to **Configuration** → **Admin API integration** → **Edit** (or **Configure**).
4. Under **Admin API access scopes**, enable:

   **Required for fulfillment (mark orders as fulfilled):**
   - `read_merchant_managed_fulfillment_orders` – read fulfillment orders for merchant-managed locations
   - `write_merchant_managed_fulfillment_orders` – create fulfillments for those orders

   **Required for orders (if not already added):**
   - `read_orders` – read orders
   - `write_orders` – update order/fulfillment data

5. **Save** the configuration.
6. If you use a **Custom app**: the existing token may still have old scopes. Either:
   - **Uninstall** the app and **Install** again, then copy the new **Admin API access token**, or
   - **Reveal** the token and confirm the app description shows the new scopes (some setups require reinstall to apply scope changes).
7. Update `SHOPIFY_ADMIN_API_KEYS` in `src/config/config.ts` with the current Admin API access token if it changed.

## If you use a fulfillment service app

If orders are fulfilled from locations managed by a **fulfillment service** (not merchant-managed), use these instead:

- `read_assigned_fulfillment_orders`
- `write_assigned_fulfillment_orders`

(Your app must be the fulfillment service that owns those locations.)

## Verify scopes (optional)

After reinstalling or regenerating the token you can check granted scopes:

```http
GET https://YOUR-STORE.myshopify.com/admin/oauth/access_scopes.json
Header: X-Shopify-Access-Token: YOUR_ADMIN_ACCESS_TOKEN
```

The response should include `read_merchant_managed_fulfillment_orders` and `write_merchant_managed_fulfillment_orders` (or the assigned/third-party variants if you use those).
