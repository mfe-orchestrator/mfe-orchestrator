import mongoose, { Schema, Document, ObjectId } from 'mongoose';

export interface IMicrofrontend extends Document {
  slug: string;
  name: string;
  version: string;
  canaryVersion: string;
  url: string;
  canaryPercentage: number;
  canary: boolean;
  environmentId: ObjectId;
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
  },
  url: {
    type: String,
    required: false
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
  environmentId: {
    type: Schema.Types.ObjectId,
    ref: 'Environment',
    required: true
  },
  description: {
    type: String,
  }
}, {
  timestamps: true
});

// Add virtual for environment name
microfrontendSchema.virtual('environmentName', {
  ref: 'Environment',
  localField: 'environmentId',
  foreignField: '_id',
  justOne: true,
  options: { select: 'name' }
});

const Microfrontend = mongoose.model<IMicrofrontend>('Microfrontend', microfrontendSchema);
export default Microfrontend;