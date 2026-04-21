import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

export interface User {
  id: number;
  email: string;
  passwordHash: string;
}

@Injectable()
export class UsersService {
  private readonly users: User[];

  constructor() {
    this.users = [
      {
        id: 1,
        email: process.env.ADMIN_EMAIL || 'admin@lghorba.com',
        passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'changeme', 10),
      },
    ];
  }

  findByEmail(email: string): User | undefined {
    return this.users.find((u) => u.email === email);
  }
}
