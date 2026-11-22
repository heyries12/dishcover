namespace Dishcover.Api.Models;

public sealed class User
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string AccountType { get; set; } = "individual";
    public string Avatar { get; set; } = string.Empty;
    public string Cover { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public int? Age { get; set; }
    public string Website { get; set; } = string.Empty;
    public bool IsPrivate { get; set; }
    public string Bio { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class Post
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string? UserId { get; set; }
    public string CreatorName { get; set; } = string.Empty;
    public string CreatorUsername { get; set; } = string.Empty;
    public string CreatorAvatar { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Cuisine { get; set; } = string.Empty;
    public string Meal { get; set; } = string.Empty;
    public string CookingTime { get; set; } = string.Empty;
    public string Image { get; set; } = string.Empty;
    public string Caption { get; set; } = string.Empty;
    public string IngredientsJson { get; set; } = "[]";
    public int Likes { get; set; }
    public int Comments { get; set; }
    public string AgeLabel { get; set; } = "Just now";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class Conversation
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string UserId { get; set; } = string.Empty;
    public string ParticipantName { get; set; } = string.Empty;
    public string ParticipantUsername { get; set; } = string.Empty;
    public string ParticipantAvatar { get; set; } = string.Empty;
    public string ParticipantSpecialty { get; set; } = string.Empty;
    public string Preview { get; set; } = string.Empty;
    public string TimeLabel { get; set; } = string.Empty;
    public string Theme { get; set; } = "sage";
    public string Nickname { get; set; } = string.Empty;
    public string DefaultEmoji { get; set; } = "❤️";
    public int Unread { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<Message> Messages { get; set; } = [];
}

public sealed class Message
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string ConversationId { get; set; } = string.Empty;
    public Conversation? Conversation { get; set; }
    public string Sender { get; set; } = "me";
    public string Text { get; set; } = string.Empty;
    public string Media { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string? Reaction { get; set; }
}

public sealed class Story
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string? UserId { get; set; }
    public string CreatorName { get; set; } = string.Empty;
    public string CreatorUsername { get; set; } = string.Empty;
    public string CreatorAvatar { get; set; } = string.Empty;
    public string Media { get; set; } = string.Empty;
    public string Caption { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAt { get; set; } = DateTimeOffset.UtcNow.AddHours(24);
    public List<StoryComment> Comments { get; set; } = [];
    public List<StoryReaction> Reactions { get; set; } = [];
}

public sealed class StoryComment
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string StoryId { get; set; } = string.Empty;
    public Story? Story { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string AuthorName { get; set; } = string.Empty;
    public string AuthorAvatar { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class StoryReaction
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string StoryId { get; set; } = string.Empty;
    public Story? Story { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string Emoji { get; set; } = "❤️";
}
