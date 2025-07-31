import mongoose, { Schema, Document, ObjectId } from 'mongoose';

export enum RoleInProject{
    OWNER = 'OWNER',
    MEMBER = 'MEMBER',
    VIEWER = 'VIEWER'
}

export interface IUserProject extends Document {
  userId: ObjectId;
  projectId: ObjectId;
  role: RoleInProject;
  invitationToken: string;
  createdAt: Date;
  updatedAt: Date;
}

const userProjectSchema = new Schema<IUserProject>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: [RoleInProject.OWNER, RoleInProject.MEMBER, RoleInProject.VIEWER],
      default: RoleInProject.MEMBER,
      required: true
    },
    invitationToken: {
      type: String,
      required: false
    }
  },
  {
    timestamps: true,
  }
);

userProjectSchema.index({ userId: 1, projectId: 1 }, { unique: true });

const UserProject = mongoose.model<IUserProject>('UserProject', userProjectSchema);
export default UserProject;