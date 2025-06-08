import CustomError from './CustomError';

type ErrorDetails = {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
};

export class BusinessException extends CustomError {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(params: ErrorDetails) {
    super(params.message);
    this.name = 'BusinessException';
    this.code = params.code;
    this.statusCode = params.statusCode;
    this.details = params.details;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

export const createBusinessException = (params: Omit<ErrorDetails, 'statusCode'> & { statusCode?: number }) => {
  return new BusinessException({
    ...params,
    statusCode: params.statusCode || 400,
  });
};
