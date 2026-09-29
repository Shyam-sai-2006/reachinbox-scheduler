import { Request, Response } from "express";
import { elasticsearchService } from "../../services/elasticsearch/elasticsearch.service.js";
import { EmailSearchSchema } from "@reachinbox/shared";

export class SearchController {
  public static async search(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;

    const parsedQuery = EmailSearchSchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_QUERY", message: "Invalid search parameters" },
      });
      return;
    }

    const { q, status, page, pageSize } = parsedQuery.data;

    const result = await elasticsearchService.searchEmails({
      userId,
      query: q,
      status,
      page,
      pageSize,
    });

    const totalPages = Math.ceil(result.total / pageSize) || 1;

    res.json({
      success: true,
      data: {
        items: result.items,
        total: result.total,
        page,
        pageSize,
        totalPages,
      },
    });
  }
}
