import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';
import { getRequestId } from '../request-context';

/** Custom Winston format that injects the active X-Request-ID into every log entry. */
const requestIdFormat = winston.format((info) => {
  const requestId = getRequestId();
  if (requestId) {
    info['requestId'] = requestId;
  }
  return info;
});

@Module({
  imports: [
    WinstonModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const logLevel = configService.get<string>('LOG_LEVEL', 'info');
        const nodeEnv = configService.get<string>('NODE_ENV', 'development');
        const logFormat = configService.get<string>('LOG_FORMAT', nodeEnv === 'production' ? 'json' : 'text');

        // Define log format based on configuration
        const winstonFormat =
          logFormat === 'json'
            ? winston.format.combine(
                requestIdFormat(),
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
              )
            : winston.format.combine(
                requestIdFormat(),
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, context, requestId, ...meta }) => {
                  const contextStr = context ? `[${context}] ` : '';
                  const reqIdStr = requestId ? ` [req:${requestId}]` : '';
                  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
                  return `${timestamp} ${level}: ${contextStr}${message}${reqIdStr}${metaStr}`;
                })
              );

        return {
          level: logLevel,
          format: winstonFormat,
          transports: [
            // Console transport - logs to stdout for container orchestrators
            new winston.transports.Console({
              handleExceptions: true,
              handleRejections: true,
            }),
          ],
          exitOnError: false,
        };
      },
    }),
  ],
  exports: [WinstonModule],
})
export class LoggerModule {}
