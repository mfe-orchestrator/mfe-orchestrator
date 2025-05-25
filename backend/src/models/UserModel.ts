import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Document as MongooseDocument } from 'mongoose';

interface IUser {
  email: string;
  password: string;
  name: string;
  surname: string;
  role: string;
  isInvited: boolean;
  salt: string;
}

interface IUserDocument extends MongooseDocument {
  email: string;
  password: string;
  name: string;
  surname: string;
  role: string;
  isInvited: boolean;
  salt: string;
  comparePassword: (candidatePassword: string) => Promise<boolean>;
  generateAuthToken: () => string;
}

interface IUserSchema extends Schema {
  comparePassword: (candidatePassword: string) => Promise<boolean>;
  generateAuthToken: () => string;
}

const userSchema = new Schema<IUserDocument, Model<IUserDocument>>({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  surname: {
    type: String,
    required: true,
    trim: true,
  },
  role: {
    type: String,
    required: true,
    enum: ['user', 'admin'],
    default: 'user',
  },
  isInvited: {
    type: Boolean,
    default: false,
  },
  salt: {
    type: String,
    required: true,
  },
}, {
  timestamps: true,
});

userSchema.pre<IUserDocument>('save', async function(next) {
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.salt = salt;
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateAuthToken = function(): string {
  const token = jwt.sign(
    { _id: this._id },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '1h' }
  );
  return token;
};

const UserModel = mongoose.model<IUserDocument>('User', userSchema);
export { UserModel, IUserDocument };

// Add type declarations for jsonwebtoken
declare module 'jsonwebtoken' {
  export interface SignOptions {
    expiresIn?: string | number;
    algorithm?: string;
  }
}

const UserModel = mongoose.model<IUserDocument>('User', userSchema);
export { UserModel, IUserDocument, IUser, IUserSchema };