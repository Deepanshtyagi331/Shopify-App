// @ts-check
import "dotenv/config"; // Must be FIRST — loads .env before any other module
import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";
import mongoose from "mongoose";

import shopify from "./shopify.js";
import productCreator from "./product-creator.js";
import PrivacyWebhookHandlers from "./privacy.js";
import { connectDB } from "./db.js";
import AnnouncementAudit from "./models/announcement.model.js";

// Connect to MongoDB (uses MONGODB_URI from .env)
connectDB();

const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3000",
  10
);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();

// Set up Shopify authentication and webhook handling
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: PrivacyWebhookHandlers })
);

// If you are adding routes outside of the /api path, remember to
// also add a proxy rule for them in web/frontend/vite.config.js

app.use("/api/*", shopify.validateAuthenticatedSession());

app.use(express.json());

// Helper to ensure metafield definition exists with storefront PUBLIC_READ access
/**
 * @param {any} session
 */
async function ensureMetafieldDefinition(session) {
  const client = new shopify.api.clients.Graphql({ session });
  try {
    const response = await client.request(`
      mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition {
            id
            name
            namespace
            key
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `, {
      variables: {
        definition: {
          name: "Store Announcement",
          namespace: "my_app",
          key: "announcement",
          type: "single_line_text_field",
          ownerType: "SHOP",
          access: {
            storefront: "PUBLIC_READ"
          }
        }
      }
    });
    
    const errors = response.data.metafieldDefinitionCreate?.userErrors;
    if (errors && errors.length > 0) {
      console.log("Metafield definition note:", errors[0].message);
    } else {
      console.log("Successfully created storefront-accessible shop metafield definition!");
    }
  } catch (err) {
    console.error("Failed to ensure metafield definition (it might already exist):", (/** @type {any} */ (err)).message);
  }
}

// Endpoint to fetch the current announcement text from Shopify
app.get("/api/announcement/current", async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const client = new shopify.api.clients.Graphql({ session });
    
    const response = await client.request(`
      query {
        shop {
          metafield(namespace: "my_app", key: "announcement") {
            value
          }
        }
      }
    `);
    
    const text = response.data.shop?.metafield?.value || "";
    res.status(200).send({ text });
  } catch (err) {
    console.error("Error fetching current announcement:", err);
    res.status(500).send({ error: (/** @type {any} */ (err)).message });
  }
});

// Endpoint to save an announcement and sync it to Shopify and MongoDB
app.post("/api/announcement", async (req, res) => {
  try {
    const { text } = req.body;
    const session = res.locals.shopify.session;
    const client = new shopify.api.clients.Graphql({ session });

    if (text === undefined || text === null) {
      return res.status(400).send({ error: "Announcement text is required." });
    }

    // 1. Ensure the metafield definition is set up for storefront public read
    await ensureMetafieldDefinition(session);

    // 2. Fetch the Shop GID
    const shopData = await client.request(`
      query {
        shop {
          id
        }
      }
    `);
    const shopGid = shopData.data.shop.id;

    // 3. Set the metafield in Shopify
    const response = await client.request(`
      mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `, {
      variables: {
        metafields: [
          {
            ownerId: shopGid,
            namespace: "my_app",
            key: "announcement",
            type: "single_line_text_field",
            value: text,
          }
        ]
      }
    });

    const result = response.data.metafieldsSet;
    if (result.userErrors && result.userErrors.length > 0) {
      throw new Error(result.userErrors[0].message);
    }

    // 4. Save the entry to MongoDB database (audit history)
    let dbStatus = "saved_mongodb";
    if (mongoose.connection.readyState === 1) {
      const audit = new AnnouncementAudit({ text, shop: session.shop });
      await audit.save();
    } else {
      console.warn("MongoDB not connected. Saving announcement to global fallback memory store.");
      const store = /** @type {any[]} */ (/** @type {any} */ (global).dbFallbackStore);
      store.push({ text, shop: session.shop, timestamp: new Date() });
      dbStatus = "saved_memory_fallback";
    }

    res.status(200).send({ success: true, text, dbStatus });
  } catch (err) {
    console.error("Error setting announcement metafield:", err);
    res.status(500).send({ success: false, error: (/** @type {any} */ (err)).message });
  }
});

// Endpoint to fetch the announcement audit history from MongoDB
app.get("/api/announcement/history", async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    let history = [];

    if (mongoose.connection.readyState === 1) {
      history = await AnnouncementAudit.find({ shop: session.shop }).sort({ timestamp: -1 });
    } else {
      const store = /** @type {any[]} */ (/** @type {any} */ (global).dbFallbackStore);
      history = store
        .filter(item => item.shop === session.shop)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    res.status(200).send({ history });
  } catch (err) {
    console.error("Error fetching announcement history:", err);
    res.status(500).send({ error: (/** @type {any} */ (err)).message });
  }
});

app.get("/api/products/count", async (_req, res) => {
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  const countData = await client.request(`
    query shopifyProductCount {
      productsCount {
        count
      }
    }
  `);

  res.status(200).send({ count: countData.data.productsCount.count });
});

app.post("/api/products", async (_req, res) => {
  let status = 200;
  let error = null;

  try {
    await productCreator(res.locals.shopify.session);
  } catch (e) {
    console.log(`Failed to process products/create: ${/** @type {any} */ (e).message}`);
    status = 500;
    error = /** @type {any} */ (e).message;
  }
  res.status(status).send({ success: status === 200, error });
});

app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res, _next) => {
  return res
    .status(200)
    .set("Content-Type", "text/html")
    .send(
      readFileSync(join(STATIC_PATH, "index.html"))
        .toString()
        .replace("%VITE_SHOPIFY_API_KEY%", process.env.SHOPIFY_API_KEY || "")
    );
});

app.listen(PORT, "0.0.0.0");
