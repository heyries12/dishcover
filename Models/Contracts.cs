using System.Text.Json;

namespace Dishcover.Api.Models;

public sealed record LoginRequest(string Email, string Password, bool Remember = true);
public sealed record RegisterRequest(string Name, string Username, string Email, string Password, string AccountType);
public sealed record UpdateProfileRequest(
    string Name,
    string Username,
    string Bio,
    int? Age,
    string Location,
    string Website,
    bool IsPrivate,
    string Avatar,
    string Cover);
public sealed record CreatePostRequest(
    string Title,
    string Cuisine,
    string Meal,
    string CookingTime,
    string Image,
    string Caption,
    IReadOnlyList<string> Ingredients,
    IReadOnlyList<string>? Images = null,
    string Category = "",
    IReadOnlyList<TimelineStepRequest>? Timeline = null);
public sealed record TimelineStepRequest(int Minute, string Instruction, string Ingredients);
public sealed record TimelineStepResponse(int Minute, string Instruction, string Ingredients);
public sealed record SendMessageRequest(string Text, string? Media = null);
public sealed record UpdateThemeRequest(string Theme);
public sealed record UpdateReactionRequest(string? Reaction);
public sealed record CreateStoryRequest(string Media, string Caption);
public sealed record CreateStoryCommentRequest(string Text);
public sealed record UpdateStoryReactionRequest(string? Reaction);
public sealed record UpdateAccountRequest(string Name, string Username, string Email);
public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public sealed record UpdatePrivacyRequest(bool IsPrivate);
public sealed record UpdateConversationSettingsRequest(string Nickname, string Theme, string DefaultEmoji);

public sealed record UserResponse(
    string Id,
    string Name,
    string Username,
    string Email,
    string AccountType,
    string Avatar,
    string Cover,
    string Location,
    int? Age,
    string Website,
    bool IsPrivate,
    string Bio);
public sealed record CreatorResponse(string? Id, string Name, string Username, string Avatar);
public sealed record PostResponse(
    string Id,
    CreatorResponse Creator,
    string Title,
    string Cuisine,
    string Category,
    string Meal,
    string Time,
    string Image,
    IReadOnlyList<string> Images,
    string Caption,
    IReadOnlyList<string> Ingredients,
    IReadOnlyList<TimelineStepResponse> Timeline,
    int Likes,
    int Comments,
    string Age);
public sealed record ParticipantResponse(string Name, string Username, string Avatar, string Specialty);
public sealed record ConversationResponse(
    string Id,
    ParticipantResponse Participant,
    string Preview,
    string Time,
    string Theme,
    string Nickname,
    string DefaultEmoji,
    int Unread,
    long UpdatedAt);
public sealed record MessageResponse(
    string Id,
    string ConversationId,
    string Sender,
    string Text,
    string Media,
    long CreatedAt,
    string? Reaction);
public sealed record StoryResponse(
    string Id,
    CreatorResponse Creator,
    string Media,
    string Caption,
    long CreatedAt,
    long ExpiresAt,
    int CommentCount,
    int ReactionCount,
    string? UserReaction);
public sealed record StoryCommentResponse(
    string Id,
    string StoryId,
    string UserId,
    string AuthorName,
    string AuthorAvatar,
    string Text,
    long CreatedAt);
public sealed record SearchProfileResponse(
    string Id,
    string Name,
    string Username,
    string Avatar,
    string Bio,
    string Location,
    string AccountType,
    int DishCount);
public sealed record SearchResponse(
    IReadOnlyList<PostResponse> Posts,
    IReadOnlyList<SearchProfileResponse> Profiles);
public sealed record SocialAuthAvailability(bool Google, bool Apple);

public sealed class StoredPostDetails
{
    public List<string> Ingredients { get; set; } = [];
    public List<TimelineStepRequest> Timeline { get; set; } = [];
    public string Category { get; set; } = string.Empty;
}

public static class ApiMappings
{
    public static UserResponse ToResponse(this User user) => new(
        user.Id,
        user.Name,
        user.Username,
        user.Email,
        user.AccountType,
        user.Avatar,
        user.Cover,
        user.Location,
        user.Age,
        user.Website,
        user.IsPrivate,
        user.Bio);

    public static PostResponse ToResponse(this Post post)
    {
        StoredPostDetails details;
        try
        {
            using var document = JsonDocument.Parse(post.IngredientsJson);
            details = document.RootElement.ValueKind == JsonValueKind.Array
                ? new StoredPostDetails { Ingredients = JsonSerializer.Deserialize<List<string>>(post.IngredientsJson) ?? [] }
                : JsonSerializer.Deserialize<StoredPostDetails>(post.IngredientsJson) ?? new StoredPostDetails();
        }
        catch (JsonException)
        {
            details = new StoredPostDetails();
        }

        var images = ParseImages(post.Image);
        var category = string.IsNullOrWhiteSpace(details.Category) ? InferCategory(post.Title, post.Cuisine) : details.Category;

        return new PostResponse(
            post.Id,
            new CreatorResponse(post.UserId, post.CreatorName, post.CreatorUsername, post.CreatorAvatar),
            post.Title,
            post.Cuisine,
            category,
            post.Meal,
            post.CookingTime,
            images[0],
            images,
            post.Caption,
            details.Ingredients,
            details.Timeline.Select(step => new TimelineStepResponse(step.Minute, step.Instruction, step.Ingredients)).ToList(),
            post.Likes,
            post.Comments,
            post.AgeLabel);
    }

    private static IReadOnlyList<string> ParseImages(string value)
    {
        if (value.TrimStart().StartsWith('['))
        {
            try
            {
                var images = JsonSerializer.Deserialize<List<string>>(value)?.Where(image => !string.IsNullOrWhiteSpace(image)).ToList();
                if (images is { Count: > 0 }) return images;
            }
            catch (JsonException)
            {
                // Fall through to the legacy single-image value.
            }
        }
        return [value];
    }

    private static string InferCategory(string title, string cuisine)
    {
        var value = title.ToLowerInvariant();
        if (value.Contains("pasta") || value.Contains("pomodoro")) return "Pasta";
        if (value.Contains("pizza") || value.Contains("margherita")) return "Pizza";
        if (value.Contains("cake")) return "Cakes";
        if (value.Contains("salad") || value.Contains("bowl")) return "Salads";
        if (value.Contains("salmon") || value.Contains("fish")) return "Seafood";
        return cuisine == "Filipino" ? "Main dishes" : "Specialties";
    }

    public static ConversationResponse ToResponse(this Conversation conversation) => new(
        conversation.Id,
        new ParticipantResponse(
            conversation.ParticipantName,
            conversation.ParticipantUsername,
            conversation.ParticipantAvatar,
            conversation.ParticipantSpecialty),
        conversation.Preview,
        conversation.TimeLabel,
        conversation.Theme,
        conversation.Nickname,
        conversation.DefaultEmoji,
        conversation.Unread,
        conversation.UpdatedAt.ToUnixTimeMilliseconds());

    public static MessageResponse ToResponse(this Message message) => new(
        message.Id,
        message.ConversationId,
        message.Sender,
        message.Text,
        message.Media,
        message.CreatedAt.ToUnixTimeMilliseconds(),
        message.Reaction);

    public static StoryResponse ToResponse(this Story story, string currentUserId) => new(
        story.Id,
        new CreatorResponse(story.UserId, story.CreatorName, story.CreatorUsername, story.CreatorAvatar),
        story.Media,
        story.Caption,
        story.CreatedAt.ToUnixTimeMilliseconds(),
        story.ExpiresAt.ToUnixTimeMilliseconds(),
        story.Comments.Count,
        story.Reactions.Count,
        story.Reactions.FirstOrDefault(reaction => reaction.UserId == currentUserId)?.Emoji);

    public static StoryCommentResponse ToResponse(this StoryComment comment) => new(
        comment.Id,
        comment.StoryId,
        comment.UserId,
        comment.AuthorName,
        comment.AuthorAvatar,
        comment.Text,
        comment.CreatedAt.ToUnixTimeMilliseconds());
}
