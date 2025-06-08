import mongoose, { Schema, Types, Document } from 'mongoose';

export interface IMicrofrontend extends Document {
  slug: string;
  name: string;
  version: string;
  canaryVersion: string;
  url: string;
  canaryPercentage: number;
  canary: boolean;
  environment: Types.ObjectId;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const microfrontendSchema = new Schema({
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  name: {
    type: String,
    required: true
  },
  version: {
    type: String,
    required: true
  },
  canaryVersion: {
    type: String,
    default: ''
  },
  url: {
    type: String,
    required: true
  },
  canaryPercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  canary: {
    type: Boolean,
    default: false
  },
  environment: {
    type: Schema.Types.ObjectId,
    ref: 'Environment',
    required: true
  },
  description: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Add virtual for environment name
microfrontendSchema.virtual('environmentName', {
  ref: 'Environment',
  localField: 'environment',
  foreignField: '_id',
  justOne: true,
  options: { select: 'name' }
});

const Microfrontend = mongoose.model<IMicrofrontend>('Microfrontend', microfrontendSchema);
export default Microfrontend;