import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCollectorService } from '../error-collector/error-collector.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly collector: ErrorCollectorService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx    = host.switchToHttp();
    const res    = ctx.getResponse<Response>();
    const req    = ctx.getRequest<Request>();

    const status: number =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const httpResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    this.logger.error(
      `${req.method} ${req.url} → ${status}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    if (status >= 500) {
      this.collector.push({
        method:  req.method,
        url:     req.url,
        status,
        message: exception instanceof Error ? exception.message : String(exception),
        stack:   exception instanceof Error ? exception.stack   : undefined,
      });
    }

    const body =
      typeof httpResponse === 'object' && httpResponse !== null
        ? { statusCode: status, ...(httpResponse as object) }
        : { statusCode: status, message: httpResponse ?? 'Internal server error' };

    res.status(status).json(body);
  }
}
