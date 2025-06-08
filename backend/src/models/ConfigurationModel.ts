import { model, Schema } from 'mongoose';

export interface IConfiguration extends Document {
  name: string;
  value: string;
}

const configSchema = new Schema<IConfiguration>({
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

const Configuration = model<IConfiguration>('Configuration', configSchema);
export default Configuration;

