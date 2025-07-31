import mongoose, { Schema, Document, ObjectId } from 'mongoose';

export interface IEnvironment extends Document {
  name: string;
  description: string;
  slug: string;
  projectId: string;
}

const environmentSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
  },
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true,
  },
}, {
  timestamps: true,
});

const Environment = mongoose.model<IEnvironment>('Environment', environmentSchema);
export default Environment;
