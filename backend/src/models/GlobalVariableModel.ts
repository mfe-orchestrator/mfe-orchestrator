import mongoose, { Document, Schema } from 'mongoose';

export interface IGlobalVariable extends Document {
  key: string;
  value: string;
  environmentId: string;
  createdAt: Date;
  updatedAt: Date;
}

const globalVariableSchema = new Schema<IGlobalVariable>(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },
    value: {
      type: String,
      required: true,
    },
    environmentId: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Create a compound index to ensure key + environmentId is unique
globalVariableSchema.index(
  { key: 1, environmentId: 1 },
  { unique: true }
);

const GlobalVariable = mongoose.model<IGlobalVariable>('GlobalVariable', globalVariableSchema);
export default GlobalVariable;
