// Feature flags — flip a value + redeploy to toggle.
//
// SHOP_ENABLED: the shop/commission system is fully built and migrated, but
// hidden from the UI until we're ready to use it (re-test the buy → receipt
// flow before flipping this back to `true`). Hiding it here removes every
// entry point: the public-profile storefront, the dashboard link, and the
// /dashboard/shop page (which redirects away while disabled). The shop API
// routes (src/app/api/shop/*) answer 404 while disabled too, so hiding the UI is
// not the only thing standing between the public and the order/item endpoints.
export const SHOP_ENABLED = false;
