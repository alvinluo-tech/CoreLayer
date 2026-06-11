import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError, extractErrorMessage, logError } from "../../shared/errors.js";
import { withErrorHandling } from "../middleware/error-handler.js";

const app = new Hono();

app.get(
  "/",
  withErrorHandling("articles/list", async (c) => {
    const status = c.req.query("status");
    const category = c.req.query("category");
    const limit = c.req.query("limit");

    const articles = await getRepositories().articles.list({
      status: status ?? undefined,
      category: category ?? undefined,
      limit: limit ? Number(limit) : undefined,
    });

    return c.json({ articles, count: articles.length });
  }),
);

app.post(
  "/",
  withErrorHandling("articles/create", async (c) => {
    const body = await c.req.json<{
      title: string;
      url?: string;
      category?: string;
      description?: string;
    }>();

    if (!body.title?.trim()) {
      return apiError(c, "Title is required", 400);
    }

    const article = await getRepositories().articles.create({
      title: body.title,
      url: body.url,
      category: body.category,
      description: body.description,
    });

    return c.json({ article }, 201);
  }),
);

// PATCH has custom 404 classification — keep manual try/catch
app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const body = await c.req.json<{
      status?: string;
      rating?: number;
      notes?: string;
    }>();
    const article = await getRepositories().articles.update(id, body);
    return c.json({ article });
  } catch (err) {
    logError("articles/update", err);
    const msg = extractErrorMessage(err);
    return apiError(c, msg.toLowerCase().includes("not found") ? "Article not found" : msg,
      msg.toLowerCase().includes("not found") ? 404 : 500);
  }
});

export default app;
