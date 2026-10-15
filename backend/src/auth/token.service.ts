import { Injectable, UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';

export type TokenPayload = { sub: string; kind: 'user' | 'admin' };

@Injectable()
export class TokenService {
  private readonly secret: string;
  private readonly expiresIn: string;

  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET is missing or shorter than 32 characters. Set it in backend/.env');
    }
    this.secret = secret;
    this.expiresIn = process.env.JWT_EXPIRES_IN ?? '7d';
  }

  sign(payload: TokenPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn } as jwt.SignOptions);
  }

  verify(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, this.secret);
      if (typeof decoded !== 'object' || !decoded.sub || (decoded.kind !== 'user' && decoded.kind !== 'admin')) {
        throw new Error('bad payload');
      }
      return { sub: String(decoded.sub), kind: decoded.kind };
    } catch {
      throw new UnauthorizedException('auth.invalidToken');
    }
  }
}
