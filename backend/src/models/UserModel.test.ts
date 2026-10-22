import { describe, expect, it } from "vitest"
import User, { UserStatus } from "./UserModel"

const aUser = () =>
    new User({
        email: "someone@example.com",
        password: "a-password",
        name: "Some",
        surname: "One",
        status: UserStatus.ACTIVE,
        salt: "a-salt",
        activateEmailToken: "an-activation-token",
        activateEmailExpires: new Date("2026-01-01T00:00:00.000Z"),
        resetPasswordToken: "a-reset-token",
        resetPasswordExpires: new Date("2026-01-01T00:00:00.000Z"),
        lastLoginAt: new Date("2026-01-01T00:00:00.000Z")
    })

describe("toFrontendObject", () => {
    it("given a user awaiting activation, when it is sent to the client, then the activation token does not travel with it", () => {
        const object = aUser().toFrontendObject()

        expect(object.activateEmailToken).toBeUndefined()
        expect(object.activateEmailExpires).toBeUndefined()
    })

    it("given a user with a pending password reset, when it is sent to the client, then the reset token does not travel with it", () => {
        const object = aUser().toFrontendObject()

        expect(object.resetPasswordToken).toBeUndefined()
        expect(object.resetPasswordExpires).toBeUndefined()
    })

    it("given a user, when it is sent to the client, then the credentials and the access date stay in the database", () => {
        const object = aUser().toFrontendObject()

        expect(object.password).toBeUndefined()
        expect(object.salt).toBeUndefined()
        expect(object.lastLoginAt).toBeUndefined()
    })

    it("given a user, when it is sent to the client, then what the console shows about the account is kept", () => {
        const object = aUser().toFrontendObject()

        expect(object.email).toBe("someone@example.com")
        expect(object.name).toBe("Some")
        expect(object.surname).toBe("One")
        expect(object.status).toBe(UserStatus.ACTIVE)
    })
})
