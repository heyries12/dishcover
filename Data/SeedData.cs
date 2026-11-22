using System.Data;
using System.Text.Json;
using Dishcover.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Dishcover.Api.Data;

public static class SeedData
{
    public const string DemoUserId = "user-demo";
    public const string DemoEmail = "demo@dishcover.app";
    public const string DemoPassword = "Dishcover123!";

    public static async Task InitializeAsync(DishcoverDbContext db, IPasswordHasher<User> passwordHasher)
    {
        await db.Database.EnsureCreatedAsync();
        await EnsureConversationSettingsSchemaAsync(db);
        await EnsureStorySchemaAsync(db);
        if (!await db.Users.AnyAsync())
        {
            var demoUser = new User
            {
                Id = DemoUserId,
                Name = "Alex Rivera",
                Username = "@alexcooks",
                Email = DemoEmail,
                AccountType = "individual",
                Avatar = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=180&q=85",
                Cover = "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1500&q=85",
                Location = "Cebu City, Philippines",
                Age = 27,
                Website = "https://dishcover.app/alexcooks",
                Bio = "Home cook, market wanderer, and collector of family recipes. Sharing food that tastes like home."
            };
            demoUser.PasswordHash = passwordHasher.HashPassword(demoUser, DemoPassword);
            db.Users.Add(demoUser);

            db.Posts.AddRange(CreatePosts());
            AddStarterConversations(db, demoUser.Id);
            await db.SaveChangesAsync();
        }

        if (!await db.Stories.AnyAsync())
        {
            db.Stories.AddRange(CreateStories());
            await db.SaveChangesAsync();
        }
    }

    private static async Task EnsureStorySchemaAsync(DishcoverDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "Stories" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_Stories" PRIMARY KEY,
                "UserId" TEXT NULL,
                "CreatorName" TEXT NOT NULL,
                "CreatorUsername" TEXT NOT NULL,
                "CreatorAvatar" TEXT NOT NULL,
                "Media" TEXT NOT NULL,
                "Caption" TEXT NOT NULL,
                "CreatedAt" TEXT NOT NULL,
                "ExpiresAt" TEXT NOT NULL
            );
            """);
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "StoryComments" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_StoryComments" PRIMARY KEY,
                "StoryId" TEXT NOT NULL,
                "UserId" TEXT NOT NULL,
                "AuthorName" TEXT NOT NULL,
                "AuthorAvatar" TEXT NOT NULL,
                "Text" TEXT NOT NULL,
                "CreatedAt" TEXT NOT NULL,
                CONSTRAINT "FK_StoryComments_Stories_StoryId" FOREIGN KEY ("StoryId") REFERENCES "Stories" ("Id") ON DELETE CASCADE
            );
            """);
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "StoryReactions" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_StoryReactions" PRIMARY KEY,
                "StoryId" TEXT NOT NULL,
                "UserId" TEXT NOT NULL,
                "Emoji" TEXT NOT NULL,
                CONSTRAINT "FK_StoryReactions_Stories_StoryId" FOREIGN KEY ("StoryId") REFERENCES "Stories" ("Id") ON DELETE CASCADE
            );
            """);
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS \"IX_Stories_ExpiresAt\" ON \"Stories\" (\"ExpiresAt\");");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS \"IX_StoryComments_StoryId_CreatedAt\" ON \"StoryComments\" (\"StoryId\", \"CreatedAt\");");
        await db.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS \"IX_StoryReactions_StoryId_UserId\" ON \"StoryReactions\" (\"StoryId\", \"UserId\");");
    }

    private static async Task EnsureConversationSettingsSchemaAsync(DishcoverDbContext db)
    {
        var connection = db.Database.GetDbConnection();
        var closeWhenDone = connection.State == ConnectionState.Closed;
        if (closeWhenDone) await connection.OpenAsync();
        var columns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = "PRAGMA table_info('Conversations');";
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync()) columns.Add(reader.GetString(1));
        }
        if (!columns.Contains("Nickname"))
        {
            await using var command = connection.CreateCommand();
            command.CommandText = "ALTER TABLE \"Conversations\" ADD COLUMN \"Nickname\" TEXT NOT NULL DEFAULT '';";
            await command.ExecuteNonQueryAsync();
        }
        if (!columns.Contains("DefaultEmoji"))
        {
            await using var command = connection.CreateCommand();
            command.CommandText = "ALTER TABLE \"Conversations\" ADD COLUMN \"DefaultEmoji\" TEXT NOT NULL DEFAULT '❤️';";
            await command.ExecuteNonQueryAsync();
        }
        var messageColumns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = "PRAGMA table_info('Messages');";
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync()) messageColumns.Add(reader.GetString(1));
        }
        if (!messageColumns.Contains("Media"))
        {
            await using var command = connection.CreateCommand();
            command.CommandText = "ALTER TABLE \"Messages\" ADD COLUMN \"Media\" TEXT NOT NULL DEFAULT '';";
            await command.ExecuteNonQueryAsync();
        }
        if (closeWhenDone) await connection.CloseAsync();
    }

    private static IEnumerable<Story> CreateStories()
    {
        var now = DateTimeOffset.UtcNow;
        yield return Story("story-maya", "Maya Santos", "@mayaskitchen", "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=85", "https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=900&q=88", "Adobo simmering low and slow today.", now.AddMinutes(-18));
        yield return Story("story-marco", "Marco Bellini", "@marcocooks", "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=100&q=85", "https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=900&q=88", "Fresh pasta, made by hand.", now.AddMinutes(-42));
        yield return Story("story-hana", "Hana Mori", "@hanastable", "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=100&q=85", "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=900&q=88", "Tonight's miso glaze is ready.", now.AddHours(-2));
        yield return Story("story-sam", "Sam Torres", "@samtastes", "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&q=85", "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=88", "Market haul turned into lunch.", now.AddHours(-3));
    }

    private static Story Story(string id, string name, string username, string avatar, string media, string caption, DateTimeOffset createdAt) => new()
    {
        Id = id,
        CreatorName = name,
        CreatorUsername = username,
        CreatorAvatar = avatar,
        Media = media,
        Caption = caption,
        CreatedAt = createdAt,
        ExpiresAt = createdAt.AddHours(24)
    };

    public static void AddStarterConversations(DishcoverDbContext db, string userId)
    {
        var suffix = userId == DemoUserId ? string.Empty : $"-{userId}";
        var now = DateTimeOffset.UtcNow;
        var conversations = new[]
        {
            new Conversation
            {
                Id = $"chat-maya{suffix}", UserId = userId, ParticipantName = "Maya Santos", ParticipantUsername = "@mayaskitchen",
                ParticipantAvatar = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=85",
                ParticipantSpecialty = "Filipino comfort food", Preview = "The cane vinegar makes a difference!", TimeLabel = "9:42 AM",
                Theme = "sage", DefaultEmoji = "❤️", Unread = 2, UpdatedAt = now.AddMinutes(-1)
            },
            new Conversation
            {
                Id = $"chat-marco{suffix}", UserId = userId, ParticipantName = "Marco Bellini", ParticipantUsername = "@marcocooks",
                ParticipantAvatar = "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=100&q=85",
                ParticipantSpecialty = "Italian classics", Preview = "I'll send you my dough ratios.", TimeLabel = "Yesterday",
                Theme = "tomato", DefaultEmoji = "🍝", UpdatedAt = now.AddDays(-1)
            },
            new Conversation
            {
                Id = $"chat-hana{suffix}", UserId = userId, ParticipantName = "Hana Mori", ParticipantUsername = "@hanastable",
                ParticipantAvatar = "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=100&q=85",
                ParticipantSpecialty = "Japanese home cooking", Preview = "Thank you for trying the recipe.", TimeLabel = "Tue",
                Theme = "ocean", DefaultEmoji = "😋", UpdatedAt = now.AddDays(-2)
            }
        };
        db.Conversations.AddRange(conversations);

        db.Messages.AddRange(
            Message($"message-maya-1{suffix}", conversations[0].Id, "them", "Your adobo looks incredible. Do you use cane or coconut vinegar?", now.AddMinutes(-8)),
            Message($"message-maya-2{suffix}", conversations[0].Id, "me", "Thank you! I use cane vinegar, then let the sauce rest for about ten minutes.", now.AddMinutes(-7), "❤️"),
            Message($"message-maya-3{suffix}", conversations[0].Id, "them", "The cane vinegar makes a difference! I'm trying your version this weekend.", now.AddMinutes(-6)),
            Message($"message-marco-1{suffix}", conversations[1].Id, "them", "Your pasta shape is perfect. Are you making the dough by hand?", now.AddDays(-1).AddMinutes(-3)),
            Message($"message-marco-2{suffix}", conversations[1].Id, "me", "Still learning, but yes! I need to work on getting it thinner.", now.AddDays(-1).AddMinutes(-2)),
            Message($"message-marco-3{suffix}", conversations[1].Id, "them", "I'll send you my dough ratios.", now.AddDays(-1).AddMinutes(-1), "😋"),
            Message($"message-hana-1{suffix}", conversations[2].Id, "me", "The miso salmon was a hit with my family.", now.AddDays(-2).AddMinutes(-2)),
            Message($"message-hana-2{suffix}", conversations[2].Id, "them", "Thank you for trying the recipe. That makes me so happy!", now.AddDays(-2).AddMinutes(-1), "❤️"));
    }

    private static Message Message(string id, string conversationId, string sender, string text, DateTimeOffset createdAt, string? reaction = null) => new()
    {
        Id = id,
        ConversationId = conversationId,
        Sender = sender,
        Text = text,
        CreatedAt = createdAt,
        Reaction = reaction
    };

    private static IEnumerable<Post> CreatePosts()
    {
        yield return Post("post-adobo", "Maya Santos", "@mayaskitchen", "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=85", "Smoky Chicken Adobo", "Filipino", "Dinner", "55 min", "https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=1100&q=88", "My lola's adobo, finished over charcoal for a gentle smokiness. The secret is letting the sauce rest before serving.", ["Chicken", "Soy sauce", "Cane vinegar"], 1248, 86, "18 min ago", 6);
        yield return Post("post-pasta", "Marco Bellini", "@marcocooks", "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=100&q=85", "Sunday Pomodoro", "Italian", "Lunch", "35 min", "https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=1100&q=88", "Simple ingredients, patient heat. San Marzano tomatoes, basil, and the pasta water doing all the work.", ["Tomatoes", "Fresh basil", "Parmigiano"], 897, 42, "1 hr ago", 5);
        yield return Post("post-salmon", "Hana Mori", "@hanastable", "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=100&q=85", "Miso Glazed Salmon", "Japanese", "Dinner", "30 min", "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1100&q=88", "Sweet white miso gives this salmon its caramelized edges. Best with steamed rice and quick-pickled cucumber.", ["Salmon", "White miso", "Mirin"], 1764, 112, "3 hrs ago", 4);
        yield return Post("post-pizza", "Marco Bellini", "@marcocooks", "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=100&q=85", "Garden Margherita", "Italian", "Dinner", "1 hr", "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1100&q=88", "A blistered crust, crushed tomatoes, and basil picked five minutes before baking.", ["00 flour", "Tomatoes", "Mozzarella"], 2301, 164, "Yesterday", 3);
        yield return Post("post-salad", "Sam Torres", "@samtastes", "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&q=85", "Market Green Bowl", "Western", "Lunch", "15 min", "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1100&q=88", "Everything crisp and green from this morning's market, with a punchy citrus dressing.", ["Avocado", "Greens", "Citrus"], 623, 28, "Yesterday", 2);
        yield return Post("post-dessert", "Maya Santos", "@mayaskitchen", "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=85", "Mango Cloud Cake", "Dessert", "Dessert", "2 hrs", "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1100&q=88", "Philippine mangoes folded into the lightest cream, made for my sister's birthday table.", ["Mango", "Cream", "Vanilla"], 3106, 207, "2 days ago", 1);
    }

    private static Post Post(string id, string creatorName, string creatorUsername, string creatorAvatar, string title, string cuisine, string meal, string cookingTime, string image, string caption, IReadOnlyList<string> ingredients, int likes, int comments, string ageLabel, int hoursAgo) => new()
    {
        Id = id,
        CreatorName = creatorName,
        CreatorUsername = creatorUsername,
        CreatorAvatar = creatorAvatar,
        Title = title,
        Cuisine = cuisine,
        Meal = meal,
        CookingTime = cookingTime,
        Image = image,
        Caption = caption,
        IngredientsJson = JsonSerializer.Serialize(ingredients),
        Likes = likes,
        Comments = comments,
        AgeLabel = ageLabel,
        CreatedAt = DateTimeOffset.UtcNow.AddHours(-hoursAgo)
    };
}
