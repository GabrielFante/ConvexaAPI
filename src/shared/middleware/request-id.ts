import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { runWithRequestId } from "../request/request-context";

export const REQUEST_ID_HEADER = "X-Request-Id";

const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const received = req.get(REQUEST_ID_HEADER);
  const requestId =
    received && VALID_REQUEST_ID.test(received) ? received : randomUUID();

  res.setHeader(REQUEST_ID_HEADER, requestId);
  runWithRequestId(requestId, next);
};
