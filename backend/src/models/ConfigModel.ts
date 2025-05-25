import { model, Schema } from 'mongoose';

export interface IConfig {
  name: string;
  value: string;
}

const configSchema = new Schema<IConfig>({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  value: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true
});

export const Config = model<IConfig>('Config', configSchema);
