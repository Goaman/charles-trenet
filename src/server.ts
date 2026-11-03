#!/usr/bin/env bun
import { handle } from "./app.ts";
import { stats } from "./db.ts";

const port = Number(process.env.PORT ?? 3000);
const server = Bun.serve({
  port,
  hostname: process.env.HOST ?? "0.0.0.0",
  async fetch(req) {
    try {
      return await handle(req);
    } catch (err) {
      console.error(new Date().toISOString(), req.url, err);
      return new Response("Erreur interne.", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  },
});
console.log(`charles-trenet.net — ${stats.articles} articles, ${stats.songs} chansons — http://localhost:${server.port}/`);
