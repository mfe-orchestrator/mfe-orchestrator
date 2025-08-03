import { model, Schema, ObjectId, Document } from 'mongoose';

export interface IDeployment extends Document<ObjectId> {
  projectId: ObjectId;
  environmentId: ObjectId;
  active: boolean;
}

const deploymentSchema = new Schema<IDeployment>({
  projectId: {
    type: Schema.Types.ObjectId,
    required: true,
    trim: true
  },
  environmentId: {
    type: Schema.Types.ObjectId,
    required: true,
    trim: true
  },
  active: {
    type: Boolean,
    required: true,
    default: true
  }
}, {
  timestamps: true
});

const Deployment = model<IDeployment>('Deployment', deploymentSchema);
export default Deployment;

