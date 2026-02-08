"""Configuration using pydantic-settings when available (pydantic v2).

This file is compatible with both pydantic v2 (pydantic-settings) and v1.
It prefers `pydantic-settings.BaseSettings` and falls back to `pydantic.BaseSettings`.
"""

try:
    # pydantic v2 separate settings package
    from pydantic_settings import BaseSettings, SettingsConfigDict

    _USING_PYDANTIC_SETTINGS = True
except Exception:
    from pydantic import BaseSettings

    _USING_PYDANTIC_SETTINGS = False


if _USING_PYDANTIC_SETTINGS:
    class Settings(BaseSettings):
        APP_NAME: str = "Bantay"
        SECRET_KEY: str = "changeme_in_production"
        ALGORITHM: str = "HS256"
        ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
        DATABASE_URL: str = "sqlite:///./bantay.db"
        TRACCAR_SHARED_SECRET: str = "traccar_shared_secret"
        # Traccar API integration for registering devices (required in non-testing)
        TRACCAR_API_URL: str = "https://traccar.dummycore.top"
        TRACCAR_API_TOKEN: str = "RjBEAiBSYj2DQ5WAxhG6m7ORQhgtmdnn-9GZsfzsMqNyA9Y07gIgQk17ALtZ8vToLxTvk412Llj5oK_gyHJ0aOggOM3VawV7InUiOjEsImUiOiIyMDI2LTA5LTI3VDE2OjAwOjAwLjAwMCswMDowMCJ9"
        # When running tests, set TESTING=1 in env to bypass external integrations
        TESTING: bool = False
        # Optional default admin user to create on startup (useful for dev/testing)
        ADMIN_EMAIL: str = "admin@example.com"
        ADMIN_PASSWORD: str = "adminpass"
        ADMIN_NAME: str = "Admin"
        # Whether to create the default admin user during application startup.
        # Set to False in environments where automatic user creation is undesirable.
        ADMIN_CREATE_ON_STARTUP: bool = True
        # Password scheme preference: 'bcrypt', 'argon2', 'plaintext', or 'auto'
        # 'auto' will try bcrypt then argon2 and fall back to plaintext.
        PASSWORD_SCHEME: str = "auto"

    # configure env file for pydantic-settings
    Settings.model_config = SettingsConfigDict(env_file=".env")
else:
    class Settings(BaseSettings):
        APP_NAME: str = "Bantay"
        SECRET_KEY: str = "changeme_in_production"
        ALGORITHM: str = "HS256"
        ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
        DATABASE_URL: str = "sqlite:///./bantay.db"
        TRACCAR_SHARED_SECRET: str = "traccar_shared_secret"
        # Traccar API integration for registering devices (required in non-testing)
        TRACCAR_API_URL: str = "http://gt06.dummycore.top:8082"
        TRACCAR_API_TOKEN: str = "RSDBGAiEA7hhAOFmBU0Yj8ms6tRmI2lZxtZasoxHhNrOm5yBgKBcCIQDeajBwOZcpkKJABudOtLCuOiiHLFsPA1Jb8dvqK0cH-HsiaSI6MzQwNDM4MjY2Njk4MDM1NDA3MywidSI6MSwiZSI6IjIwMjctMDEtMzFUMTY6MDA6MDAuMDAwKzAwOjAwIn0"
        # When running tests, set TESTING=1 in env to bypass external integrations
        TESTING: bool = False
        # Optional default admin user to create on startup (useful for dev/testing)
        ADMIN_EMAIL: str = "admin@example.com"
        ADMIN_PASSWORD: str = "adminpass"
        ADMIN_NAME: str = "Admin"
        # Whether to create the default admin user during application startup.
        # Set to False in environments where automatic user creation is undesirable.
        ADMIN_CREATE_ON_STARTUP: bool = True
        # Password scheme preference: 'bcrypt', 'argon2', 'plaintext', or 'auto'
        # 'auto' will try bcrypt then argon2 and fall back to plaintext.
        PASSWORD_SCHEME: str = "auto"

        class Config:
            env_file = ".env"


settings = Settings()
