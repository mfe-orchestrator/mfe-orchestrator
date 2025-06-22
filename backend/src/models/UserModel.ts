import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { Document as MongooseDocument } from 'mongoose';
import jwt from 'jsonwebtoken';
import { AuthTokenDataDTO } from '../dto/AuthTokenData.dto';

interface IUser {
  email: string;
  password: string;
  name: string;
  surname: string;
  role: string;
  isInvited: boolean;
  salt: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserDocument extends MongooseDocument {
  email: string;
  password: string;
  name: string;
  surname: string;
  role: string;
  isInvited: boolean;
  salt: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword: (candidatePassword: string) => Promise<boolean>;
  generateAuthToken: () => AuthTokenDataDTO;
  toFrontendObject: () => IUser;
}

const userSchema = new Schema<IUserDocument, Model<IUser>>({
  _id: { type: Schema.Types.ObjectId, auto: true },
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
  resetPasswordToken: {
    type: String,
    required: false,
  },
  resetPasswordExpires: {
    type: Date,
    required: false,
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
    required: false,
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

userSchema.methods.toFrontendObject = function(): IUser {
  const obj = this.toObject();
  delete obj.password;
  delete obj.salt;
  delete obj.__v;
  return obj;
};

userSchema.methods.generateAuthToken = function(): AuthTokenDataDTO {
  const payload = {
    id: this._id.toString(),
    email: this.email,
    role: this.role,
    iss: "microfronted.orchestrator.hub"
  };

  const accessToken = jwt.sign(
    payload,
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '24h' }
  );
  
  return {
    accessToken,
    tokenPayload: payload
  }
};

const User = mongoose.model<IUserDocument>('User', userSchema);
export default User;