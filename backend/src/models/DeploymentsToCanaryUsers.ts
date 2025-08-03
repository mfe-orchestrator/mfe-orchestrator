import { model, Schema, ObjectId, Document } from 'mongoose';

export interface IDeploymentToCanaryUsers extends Document<ObjectId> {
  deploymentId: ObjectId;
  microfrontendId: ObjectId;
  userId: string;
  enabled: boolean;
}

const deploymentToCanaryUsersSchema = new Schema<IDeploymentToCanaryUsers>({
  deploymentId: {
    type: Schema.Types.ObjectId,
    required: true,
    trim: true
  },
  microfrontendId: {
    type: Schema.Types.ObjectId,
    trim: true
  },
  userId: {
    type: String,
    required: true,
    trim: true
  },
  enabled: {
    type: Boolean,
    required: true,
    default: true
  }
}, {
  timestamps: true
});

const DeploymentToCanaryUsers = model<IDeploymentToCanaryUsers>('DeploymentToCanaryUsers', deploymentToCanaryUsersSchema);
export default DeploymentToCanaryUsers;

