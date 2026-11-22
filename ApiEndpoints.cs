using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Dishcover.Api.Data;
using Dishcover.Api.Models;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Dishcover.Api;

public static class ApiEndpoints
{
    public const string ExternalCookieScheme = "Dishcover.External";
    private static readonly HashSet<string> Themes = ["sage", "tomato", "ocean", "plum", "sunset"];
    private static readonly HashSet<string> Reactions = ["❤️", "😋", "😂", "👏", "🔥", "👍"];
    private static readonly HashSet<string> ConversationEmojis = ["❤️", "👍", "🔥", "😋", "😂", "👏", "😍", "🥰", "🍕", "🍝", "🍜", "🍰", "🥑", "🌮", "☕", "🎉"];

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/health", () => Results.Ok(new { status = "healthy" }));

        var auth = app.MapGroup("/api/auth");
        auth.MapPost("/login", LoginAsync);
        auth.MapPost("/register", RegisterAsync);
        auth.MapPost("/logout", (Delegate)LogoutAsync).RequireAuthorization();
        auth.MapGet("/session", GetSessionAsync);
        auth.MapGet("/me", GetCurrentUserAsync).RequireAuthorization();
        auth.MapGet("/providers", GetSocialProviders);
        auth.MapGet("/external/{provider}", BeginExternalLogin);
        auth.MapGet("/external/callback", CompleteExternalLoginAsync);

        app.MapPut("/api/profile", UpdateProfileAsync).RequireAuthorization();
        app.MapGet("/api/posts", GetPostsAsync).RequireAuthorization();
        app.MapPost("/api/posts", CreatePostAsync).RequireAuthorization();
        app.MapGet("/api/conversations", GetConversationsAsync).RequireAuthorization();
        app.MapGet("/api/conversations/{conversationId}/messages", GetMessagesAsync).RequireAuthorization();
        app.MapPost("/api/conversations/{conversationId}/messages", SendMessageAsync).RequireAuthorization();
        app.MapPatch("/api/conversations/{conversationId}/theme", UpdateThemeAsync).RequireAuthorization();
        app.MapPut("/api/conversations/{conversationId}/settings", UpdateConversationSettingsAsync).RequireAuthorization();
        app.MapPatch("/api/messages/{messageId}/reaction", UpdateReactionAsync).RequireAuthorization();
        app.MapGet("/api/stories", GetStoriesAsync).RequireAuthorization();
        app.MapPost("/api/stories", CreateStoryAsync).RequireAuthorization();
        app.MapGet("/api/stories/{storyId}/comments", GetStoryCommentsAsync).RequireAuthorization();
        app.MapPost("/api/stories/{storyId}/comments", CreateStoryCommentAsync).RequireAuthorization();
        app.MapPatch("/api/stories/{storyId}/reaction", UpdateStoryReactionAsync).RequireAuthorization();
        app.MapGet("/api/search", SearchAsync).RequireAuthorization();
        app.MapPut("/api/account", UpdateAccountAsync).RequireAuthorization();
        app.MapPut("/api/account/password", ChangePasswordAsync).RequireAuthorization();
        app.MapPut("/api/account/privacy", UpdatePrivacyAsync).RequireAuthorization();
    }

    private static async Task<IResult> LoginAsync(
        LoginRequest request,
        DishcoverDbContext db,
        IPasswordHasher<User> passwordHasher,
        HttpContext context)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.SingleOrDefaultAsync(item => item.Email == email);
        if (user is null)
        {
            return Error("That email or password doesn't match our records.", StatusCodes.Status401Unauthorized);
        }

        var verification = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verification == PasswordVerificationResult.Failed)
        {
            return Error("That email or password doesn't match our records.", StatusCodes.Status401Unauthorized);
        }

        if (verification == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.PasswordHash = passwordHasher.HashPassword(user, request.Password);
            await db.SaveChangesAsync();
        }

        await SignInAsync(context, user, request.Remember);
        return Results.Ok(user.ToResponse());
    }

    private static IResult GetSocialProviders(SocialAuthAvailability availability) => Results.Ok(availability);

    private static IResult BeginExternalLogin(string provider, SocialAuthAvailability availability)
    {
        var scheme = provider.ToLowerInvariant() switch
        {
            "google" when availability.Google => GoogleDefaults.AuthenticationScheme,
            "google" => string.Empty,
            _ => null
        };
        if (scheme is null)
        {
            return Results.NotFound();
        }
        if (scheme.Length == 0)
        {
            return Error($"{provider} sign-in is not configured yet.", StatusCodes.Status503ServiceUnavailable);
        }
        var properties = new AuthenticationProperties
        {
            RedirectUri = $"/api/auth/external/callback?provider={Uri.EscapeDataString(scheme)}"
        };
        return Results.Challenge(properties, [scheme]);
    }

    private static async Task<IResult> CompleteExternalLoginAsync(
        string provider,
        HttpContext context,
        DishcoverDbContext db,
        IPasswordHasher<User> passwordHasher)
    {
        var result = await context.AuthenticateAsync(ExternalCookieScheme);
        if (!result.Succeeded || result.Principal is null)
        {
            return Results.Redirect("/?socialError=Social%20sign-in%20could%20not%20be%20completed.");
        }
        var email = result.Principal.FindFirstValue(ClaimTypes.Email)?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email) || !new EmailAddressAttribute().IsValid(email))
        {
            await context.SignOutAsync(ExternalCookieScheme);
            return Results.Redirect("/?socialError=Your%20social%20account%20did%20not%20provide%20a%20valid%20email.");
        }

        var user = await db.Users.SingleOrDefaultAsync(item => item.Email == email);
        if (user is null)
        {
            var name = result.Principal.FindFirstValue(ClaimTypes.Name)?.Trim();
            if (string.IsNullOrWhiteSpace(name))
            {
                name = email.Split('@')[0];
            }
            var username = await GenerateUniqueUsernameAsync(db, email.Split('@')[0]);
            var picture = result.Principal.FindFirstValue("picture");
            user = new User
            {
                Name = name.Length > 50 ? name[..50] : name,
                Username = username,
                Email = email,
                AccountType = "individual",
                Avatar = Uri.TryCreate(picture, UriKind.Absolute, out _) ? picture! : $"https://api.dicebear.com/9.x/initials/svg?seed={Uri.EscapeDataString(name)}&backgroundColor=d95538",
                Cover = "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1500&q=85",
                Location = "Philippines",
                Bio = $"Joined Dishcover with {provider}. Ready to share something delicious."
            };
            var generatedPassword = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)) + "Aa!";
            user.PasswordHash = passwordHasher.HashPassword(user, generatedPassword);
            db.Users.Add(user);
            SeedData.AddStarterConversations(db, user.Id);
            await db.SaveChangesAsync();
        }

        await context.SignOutAsync(ExternalCookieScheme);
        await SignInAsync(context, user, true);
        return Results.Redirect("/?social=success");
    }

    private static async Task<string> GenerateUniqueUsernameAsync(DishcoverDbContext db, string source)
    {
        var stem = Regex.Replace(source.ToLowerInvariant(), "[^a-z0-9._]", string.Empty);
        if (stem.Length < 2) stem = "foodlover";
        if (stem.Length > 24) stem = stem[..24];
        var candidate = $"@{stem}";
        var suffix = 1;
        while (await db.Users.AnyAsync(user => user.Username == candidate))
        {
            candidate = $"@{stem}{suffix++}";
        }
        return candidate;
    }

    private static async Task<IResult> RegisterAsync(
        RegisterRequest request,
        DishcoverDbContext db,
        IPasswordHasher<User> passwordHasher,
        HttpContext context)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var username = NormalizeUsername(request.Username);
        var name = request.Name.Trim();
        var accountType = request.AccountType == "restaurant" ? "restaurant" : "individual";

        if (name.Length is < 2 or > 50)
        {
            return Error("Display name must contain 2-50 characters.");
        }
        if (!IsValidUsername(username))
        {
            return Error("Use 2-30 letters, numbers, periods, or underscores for the username.");
        }
        if (!new EmailAddressAttribute().IsValid(email))
        {
            return Error("Enter a valid email address.");
        }
        if (!IsStrongPassword(request.Password))
        {
            return Error("Password must contain at least 8 characters, an uppercase letter, a lowercase letter, and a special character.");
        }
        if (await db.Users.AnyAsync(user => user.Email == email))
        {
            return Error("An account with that email already exists.", StatusCodes.Status409Conflict);
        }
        if (await db.Users.AnyAsync(user => user.Username == username))
        {
            return Error("That username is already in use.", StatusCodes.Status409Conflict);
        }

        var user = new User
        {
            Name = name,
            Username = username,
            Email = email,
            AccountType = accountType,
            Avatar = $"https://api.dicebear.com/9.x/initials/svg?seed={Uri.EscapeDataString(name)}&backgroundColor=d95538",
            Cover = "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1500&q=85",
            Location = "Philippines",
            Bio = "New to the Dishcover table. Ready to share something delicious."
        };
        user.PasswordHash = passwordHasher.HashPassword(user, request.Password);
        db.Users.Add(user);
        SeedData.AddStarterConversations(db, user.Id);
        await db.SaveChangesAsync();
        await SignInAsync(context, user, true);
        return Results.Ok(user.ToResponse());
    }

    private static async Task<IResult> LogoutAsync(HttpContext context)
    {
        await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Results.NoContent();
    }

    private static async Task<IResult> GetCurrentUserAsync(ClaimsPrincipal principal, DishcoverDbContext db)
    {
        var user = await db.Users.FindAsync(UserId(principal));
        return user is null ? Results.Unauthorized() : Results.Ok(user.ToResponse());
    }

    private static async Task<IResult> GetSessionAsync(ClaimsPrincipal principal, DishcoverDbContext db)
    {
        if (principal.Identity?.IsAuthenticated != true)
        {
            return Results.NoContent();
        }
        var id = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        var user = id is null ? null : await db.Users.FindAsync(id);
        return user is null ? Results.NoContent() : Results.Ok(user.ToResponse());
    }

    private static async Task<IResult> UpdateProfileAsync(UpdateProfileRequest request, ClaimsPrincipal principal, DishcoverDbContext db)
    {
        var user = await db.Users.FindAsync(UserId(principal));
        if (user is null)
        {
            return Results.Unauthorized();
        }

        var name = request.Name.Trim();
        var username = NormalizeUsername(request.Username);
        var website = request.Website.Trim();
        if (name.Length is < 2 or > 50)
        {
            return Error("Display name must contain 2-50 characters.");
        }
        if (!IsValidUsername(username))
        {
            return Error("Use 2-30 letters, numbers, periods, or underscores for the username.");
        }
        if (request.Age is < 13 or > 120)
        {
            return Error("Enter an age between 13 and 120.");
        }
        if (request.Bio.Trim().Length > 150 || request.Location.Trim().Length > 70)
        {
            return Error("The bio or location is too long.");
        }
        if (website.Length > 0 && (!Uri.TryCreate(website, UriKind.Absolute, out var websiteUri) || websiteUri.Scheme is not ("http" or "https")))
        {
            return Error("Enter a valid website URL beginning with http:// or https://.");
        }
        if (!IsValidImageSource(request.Avatar) || !IsValidImageSource(request.Cover))
        {
            return Error("The profile or cover image is invalid.");
        }
        if (await db.Users.AnyAsync(item => item.Id != user.Id && item.Username == username))
        {
            return Error("That username is already in use.", StatusCodes.Status409Conflict);
        }

        user.Name = name;
        user.Username = username;
        user.Bio = request.Bio.Trim();
        user.Age = request.Age;
        user.Location = request.Location.Trim();
        user.Website = website;
        user.IsPrivate = request.IsPrivate;
        user.Avatar = request.Avatar;
        user.Cover = request.Cover;
        user.UpdatedAt = DateTimeOffset.UtcNow;

        var authoredPosts = await db.Posts.Where(post => post.UserId == user.Id).ToListAsync();
        foreach (var post in authoredPosts)
        {
            post.CreatorName = user.Name;
            post.CreatorUsername = user.Username;
            post.CreatorAvatar = user.Avatar;
        }

        await db.SaveChangesAsync();
        return Results.Ok(user.ToResponse());
    }

    private static async Task<IResult> GetPostsAsync(DishcoverDbContext db)
    {
        var posts = (await db.Posts.ToListAsync()).OrderByDescending(post => post.CreatedAt);
        return Results.Ok(posts.Select(post => post.ToResponse()));
    }

    private static async Task<IResult> CreatePostAsync(CreatePostRequest request, ClaimsPrincipal principal, DishcoverDbContext db)
    {
        var user = await db.Users.FindAsync(UserId(principal));
        if (user is null)
        {
            return Results.Unauthorized();
        }
        if (request.Title.Trim().Length is < 2 or > 100 || request.Caption.Trim().Length is < 2 or > 1000)
        {
            return Error("Add a dish name and a short story before posting.");
        }
        var images = (request.Images ?? [])
            .Where(image => !string.IsNullOrWhiteSpace(image))
            .Distinct()
            .ToList();
        if (images.Count == 0 && !string.IsNullOrWhiteSpace(request.Image))
        {
            images.Add(request.Image);
        }
        if (images.Count is < 1 or > 5 || images.Any(image => !IsValidImageSource(image)))
        {
            return Error("Add between 1 and 5 valid dish photos.");
        }
        var timeline = (request.Timeline ?? []).Take(20).ToList();
        if (timeline.Any(step => step.Minute is < 0 or > 1440 || step.Instruction.Trim().Length is < 2 or > 200 || step.Ingredients.Trim().Length > 120))
        {
            return Error("Timeline steps need a valid minute and a short instruction.");
        }
        var category = request.Category.Trim();
        if (category.Length is < 2 or > 40)
        {
            return Error("Choose a dish category.");
        }

        var details = new StoredPostDetails
        {
            Ingredients = request.Ingredients.Select(item => item.Trim()).Where(item => item.Length > 0).Take(20).ToList(),
            Timeline = timeline,
            Category = category
        };
        var post = new Post
        {
            UserId = user.Id,
            CreatorName = user.Name,
            CreatorUsername = user.Username,
            CreatorAvatar = user.Avatar,
            Title = request.Title.Trim(),
            Cuisine = request.Cuisine.Trim(),
            Meal = request.Meal.Trim(),
            CookingTime = request.CookingTime.Trim(),
            Image = JsonSerializer.Serialize(images),
            Caption = request.Caption.Trim(),
            IngredientsJson = JsonSerializer.Serialize(details),
            AgeLabel = "Just now"
        };
        db.Posts.Add(post);
        await db.SaveChangesAsync();
        return Results.Ok(post.ToResponse());
    }

    private static async Task<IResult> GetConversationsAsync(ClaimsPrincipal principal, DishcoverDbContext db)
    {
        var userId = UserId(principal);
        var conversations = (await db.Conversations
            .Where(conversation => conversation.UserId == userId)
            .ToListAsync())
            .OrderByDescending(conversation => conversation.UpdatedAt);
        return Results.Ok(conversations.Select(conversation => conversation.ToResponse()));
    }

    private static async Task<IResult> GetMessagesAsync(string conversationId, ClaimsPrincipal principal, DishcoverDbContext db)
    {
        var conversation = await FindConversationAsync(db, conversationId, UserId(principal));
        if (conversation is null)
        {
            return Results.NotFound();
        }

        if (conversation.Unread > 0)
        {
            conversation.Unread = 0;
            await db.SaveChangesAsync();
        }
        var messages = (await db.Messages
            .Where(message => message.ConversationId == conversationId)
            .ToListAsync())
            .OrderBy(message => message.CreatedAt);
        return Results.Ok(messages.Select(message => message.ToResponse()));
    }

    private static async Task<IResult> SendMessageAsync(string conversationId, SendMessageRequest request, ClaimsPrincipal principal, DishcoverDbContext db)
    {
        var conversation = await FindConversationAsync(db, conversationId, UserId(principal));
        if (conversation is null)
        {
            return Results.NotFound();
        }
        var text = request.Text?.Trim() ?? string.Empty;
        var media = request.Media?.Trim() ?? string.Empty;
        if (text.Length > 500 || (text.Length == 0 && media.Length == 0))
        {
            return Error("Add a message, a photo, or both.");
        }
        if (media.Length > 0 && !IsValidImageSource(media))
        {
            return Error("Choose a valid message photo.");
        }

        var message = new Message { ConversationId = conversation.Id, Sender = "me", Text = text, Media = media };
        conversation.Preview = text.Length > 0 ? text : "📷 Photo";
        conversation.TimeLabel = "Now";
        conversation.UpdatedAt = DateTimeOffset.UtcNow;
        db.Messages.Add(message);
        await db.SaveChangesAsync();
        return Results.Ok(message.ToResponse());
    }

    private static async Task<IResult> UpdateThemeAsync(string conversationId, UpdateThemeRequest request, ClaimsPrincipal principal, DishcoverDbContext db)
    {
        if (!Themes.Contains(request.Theme))
        {
            return Error("Choose a supported conversation theme.");
        }
        var conversation = await FindConversationAsync(db, conversationId, UserId(principal));
        if (conversation is null)
        {
            return Results.NotFound();
        }
        conversation.Theme = request.Theme;
        await db.SaveChangesAsync();
        return Results.Ok(conversation.ToResponse());
    }

    private static async Task<IResult> UpdateConversationSettingsAsync(string conversationId, UpdateConversationSettingsRequest request, ClaimsPrincipal principal, DishcoverDbContext db)
    {
        if (!Themes.Contains(request.Theme))
        {
            return Error("Choose a supported conversation theme.");
        }
        if (!ConversationEmojis.Contains(request.DefaultEmoji))
        {
            return Error("Choose a supported default emoji.");
        }
        var nickname = request.Nickname.Trim();
        if (nickname.Length > 50)
        {
            return Error("Nicknames can contain up to 50 characters.");
        }
        var conversation = await FindConversationAsync(db, conversationId, UserId(principal));
        if (conversation is null)
        {
            return Results.NotFound();
        }
        conversation.Nickname = nickname;
        conversation.Theme = request.Theme;
        conversation.DefaultEmoji = request.DefaultEmoji;
        await db.SaveChangesAsync();
        return Results.Ok(conversation.ToResponse());
    }

    private static async Task<IResult> UpdateReactionAsync(string messageId, UpdateReactionRequest request, ClaimsPrincipal principal, DishcoverDbContext db)
    {
        if (request.Reaction is not null && !Reactions.Contains(request.Reaction))
        {
            return Error("Choose a supported reaction.");
        }
        var message = await db.Messages
            .Include(item => item.Conversation)
            .SingleOrDefaultAsync(item => item.Id == messageId && item.Conversation!.UserId == UserId(principal));
        if (message is null)
        {
            return Results.NotFound();
        }
        message.Reaction = message.Reaction == request.Reaction ? null : request.Reaction;
        await db.SaveChangesAsync();
        return Results.Ok(message.ToResponse());
    }

    private static async Task<IResult> GetStoriesAsync(ClaimsPrincipal principal, DishcoverDbContext db)
    {
        var now = DateTimeOffset.UtcNow;
        var allStories = await db.Stories
            .Include(story => story.Comments)
            .Include(story => story.Reactions)
            .ToListAsync();
        var expired = allStories.Where(story => story.ExpiresAt <= now).ToList();
        if (expired.Count > 0)
        {
            db.Stories.RemoveRange(expired);
            await db.SaveChangesAsync();
        }
        var stories = allStories
            .Where(story => story.ExpiresAt > now)
            .OrderByDescending(story => story.CreatedAt)
            .Select(story => story.ToResponse(UserId(principal)));
        return Results.Ok(stories);
    }

    private static async Task<IResult> CreateStoryAsync(CreateStoryRequest request, ClaimsPrincipal principal, DishcoverDbContext db)
    {
        var user = await db.Users.FindAsync(UserId(principal));
        if (user is null)
        {
            return Results.Unauthorized();
        }
        if (!IsValidImageSource(request.Media))
        {
            return Error("Choose a valid story photo.");
        }
        var caption = request.Caption.Trim();
        if (caption.Length > 300)
        {
            return Error("Story captions can contain up to 300 characters.");
        }
        var story = new Story
        {
            UserId = user.Id,
            CreatorName = user.Name,
            CreatorUsername = user.Username,
            CreatorAvatar = user.Avatar,
            Media = request.Media,
            Caption = caption
        };
        db.Stories.Add(story);
        await db.SaveChangesAsync();
        return Results.Ok(story.ToResponse(user.Id));
    }

    private static async Task<IResult> GetStoryCommentsAsync(string storyId, DishcoverDbContext db)
    {
        var story = await db.Stories.FindAsync(storyId);
        if (story is null || story.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            return Results.NotFound();
        }
        var comments = (await db.StoryComments.Where(comment => comment.StoryId == storyId).ToListAsync())
            .OrderBy(comment => comment.CreatedAt)
            .Select(comment => comment.ToResponse());
        return Results.Ok(comments);
    }

    private static async Task<IResult> CreateStoryCommentAsync(string storyId, CreateStoryCommentRequest request, ClaimsPrincipal principal, DishcoverDbContext db)
    {
        var story = await db.Stories.FindAsync(storyId);
        var user = await db.Users.FindAsync(UserId(principal));
        if (story is null || story.ExpiresAt <= DateTimeOffset.UtcNow || user is null)
        {
            return Results.NotFound();
        }
        var text = request.Text.Trim();
        if (text.Length is < 1 or > 300)
        {
            return Error("Story comments must contain 1-300 characters.");
        }
        var comment = new StoryComment
        {
            StoryId = storyId,
            UserId = user.Id,
            AuthorName = user.Name,
            AuthorAvatar = user.Avatar,
            Text = text
        };
        db.StoryComments.Add(comment);
        await db.SaveChangesAsync();
        return Results.Ok(comment.ToResponse());
    }

    private static async Task<IResult> UpdateStoryReactionAsync(string storyId, UpdateStoryReactionRequest request, ClaimsPrincipal principal, DishcoverDbContext db)
    {
        if (request.Reaction is not null && !Reactions.Contains(request.Reaction))
        {
            return Error("Choose a supported story reaction.");
        }
        var story = await db.Stories.FindAsync(storyId);
        if (story is null || story.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            return Results.NotFound();
        }
        var userId = UserId(principal);
        var existing = await db.StoryReactions.SingleOrDefaultAsync(reaction => reaction.StoryId == storyId && reaction.UserId == userId);
        if (existing is not null && (request.Reaction is null || existing.Emoji == request.Reaction))
        {
            db.StoryReactions.Remove(existing);
        }
        else if (existing is not null)
        {
            existing.Emoji = request.Reaction!;
        }
        else if (request.Reaction is not null)
        {
            db.StoryReactions.Add(new StoryReaction { StoryId = storyId, UserId = userId, Emoji = request.Reaction });
        }
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> SearchAsync(string? query, DishcoverDbContext db)
    {
        var terms = (query ?? string.Empty)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(term => term.ToLowerInvariant())
            .Take(8)
            .ToArray();
        if (terms.Length == 0)
        {
            return Results.Ok(new SearchResponse([], []));
        }

        var allPosts = await db.Posts.ToListAsync();
        var matchingPosts = allPosts
            .Where(post => ContainsAllTerms(string.Join(' ',
                post.Title,
                post.Caption,
                post.Cuisine,
                post.Meal,
                post.CreatorName,
                post.CreatorUsername,
                post.IngredientsJson), terms))
            .OrderByDescending(post => post.CreatedAt)
            .Take(30)
            .Select(post => post.ToResponse())
            .ToList();

        var users = await db.Users.ToListAsync();
        var profiles = users
            .Where(user => ContainsAllTerms(string.Join(' ', user.Name, user.Username, user.Bio, user.Location, user.AccountType), terms))
            .Select(user => new SearchProfileResponse(
                user.Id,
                user.Name,
                user.Username,
                user.Avatar,
                user.Bio,
                user.Location,
                user.AccountType,
                allPosts.Count(post => post.UserId == user.Id)))
            .ToList();

        var registeredUsernames = users.Select(user => user.Username).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var creatorProfiles = allPosts
            .GroupBy(post => post.CreatorUsername, StringComparer.OrdinalIgnoreCase)
            .Where(group => !registeredUsernames.Contains(group.Key))
            .Select(group =>
            {
                var first = group.First();
                var cuisines = string.Join(", ", group.Select(post => post.Cuisine).Distinct().Take(2));
                return new SearchProfileResponse(
                    $"creator:{first.CreatorUsername.TrimStart('@')}",
                    first.CreatorName,
                    first.CreatorUsername,
                    first.CreatorAvatar,
                    $"Sharing {cuisines} dishes and food stories on Dishcover.",
                    "Dishcover community",
                    "creator",
                    group.Count());
            })
            .Where(profile => ContainsAllTerms(string.Join(' ', profile.Name, profile.Username, profile.Bio, profile.Location), terms));

        profiles.AddRange(creatorProfiles);
        return Results.Ok(new SearchResponse(matchingPosts, profiles.Take(12).ToList()));
    }

    private static async Task<IResult> UpdateAccountAsync(UpdateAccountRequest request, ClaimsPrincipal principal, DishcoverDbContext db)
    {
        var user = await db.Users.FindAsync(UserId(principal));
        if (user is null)
        {
            return Results.Unauthorized();
        }
        var name = request.Name.Trim();
        var username = NormalizeUsername(request.Username);
        var email = request.Email.Trim().ToLowerInvariant();
        if (name.Length is < 2 or > 50)
        {
            return Error("Display name must contain 2-50 characters.");
        }
        if (!IsValidUsername(username))
        {
            return Error("Use 2-30 letters, numbers, periods, or underscores for the username.");
        }
        if (!new EmailAddressAttribute().IsValid(email))
        {
            return Error("Enter a valid email address.");
        }
        if (await db.Users.AnyAsync(item => item.Id != user.Id && item.Username == username))
        {
            return Error("That username is already in use.", StatusCodes.Status409Conflict);
        }
        if (await db.Users.AnyAsync(item => item.Id != user.Id && item.Email == email))
        {
            return Error("An account with that email already exists.", StatusCodes.Status409Conflict);
        }

        user.Name = name;
        user.Username = username;
        user.Email = email;
        user.UpdatedAt = DateTimeOffset.UtcNow;
        var posts = await db.Posts.Where(post => post.UserId == user.Id).ToListAsync();
        foreach (var post in posts)
        {
            post.CreatorName = name;
            post.CreatorUsername = username;
        }
        var stories = await db.Stories.Where(story => story.UserId == user.Id).ToListAsync();
        foreach (var story in stories)
        {
            story.CreatorName = name;
            story.CreatorUsername = username;
        }
        await db.SaveChangesAsync();
        return Results.Ok(user.ToResponse());
    }

    private static async Task<IResult> ChangePasswordAsync(
        ChangePasswordRequest request,
        ClaimsPrincipal principal,
        DishcoverDbContext db,
        IPasswordHasher<User> passwordHasher)
    {
        var user = await db.Users.FindAsync(UserId(principal));
        if (user is null)
        {
            return Results.Unauthorized();
        }
        if (passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword) == PasswordVerificationResult.Failed)
        {
            return Error("Your current password is incorrect.", StatusCodes.Status401Unauthorized);
        }
        if (!IsStrongPassword(request.NewPassword))
        {
            return Error("Your new password must contain at least 8 characters, an uppercase letter, a lowercase letter, and a special character.");
        }
        if (request.CurrentPassword == request.NewPassword)
        {
            return Error("Choose a new password that is different from your current password.");
        }
        user.PasswordHash = passwordHasher.HashPassword(user, request.NewPassword);
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> UpdatePrivacyAsync(UpdatePrivacyRequest request, ClaimsPrincipal principal, DishcoverDbContext db)
    {
        var user = await db.Users.FindAsync(UserId(principal));
        if (user is null)
        {
            return Results.Unauthorized();
        }
        user.IsPrivate = request.IsPrivate;
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        return Results.Ok(user.ToResponse());
    }

    private static async Task SignInAsync(HttpContext context, User user, bool remember)
    {
        var identity = new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, user.Id),
            new Claim(ClaimTypes.Name, user.Name),
            new Claim(ClaimTypes.Email, user.Email)
        ], CookieAuthenticationDefaults.AuthenticationScheme);
        await context.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(identity),
            new AuthenticationProperties
            {
                IsPersistent = remember,
                ExpiresUtc = remember ? DateTimeOffset.UtcNow.AddDays(14) : null
            });
    }

    private static Task<Conversation?> FindConversationAsync(DishcoverDbContext db, string conversationId, string userId) =>
        db.Conversations.SingleOrDefaultAsync(conversation => conversation.Id == conversationId && conversation.UserId == userId);

    private static string UserId(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? throw new InvalidOperationException("Authenticated user ID is missing.");

    private static string NormalizeUsername(string username) => $"@{username.Trim().TrimStart('@').ToLowerInvariant()}";
    private static bool ContainsAllTerms(string value, IEnumerable<string> terms)
    {
        var searchable = value.ToLowerInvariant();
        return terms.All(searchable.Contains);
    }
    private static bool IsValidUsername(string username) => Regex.IsMatch(username, "^@[a-z0-9._]{2,30}$");
    private static bool IsStrongPassword(string password) =>
        !string.IsNullOrEmpty(password) && password.Length >= 8 &&
        password.Any(char.IsUpper) &&
        password.Any(char.IsLower) &&
        password.Any(character => !char.IsLetterOrDigit(character));
    private static bool IsValidImageSource(string value) =>
        value.Length is > 0 and <= 3_000_000 &&
        (Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" ||
         value.StartsWith("data:image/jpeg;base64,", StringComparison.Ordinal) ||
         value.StartsWith("data:image/png;base64,", StringComparison.Ordinal) ||
         value.StartsWith("data:image/webp;base64,", StringComparison.Ordinal));

    private static IResult Error(string detail, int statusCode = StatusCodes.Status400BadRequest) =>
        Results.Problem(detail: detail, statusCode: statusCode);
}
