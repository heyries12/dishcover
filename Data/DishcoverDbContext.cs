using Dishcover.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Dishcover.Api.Data;

public sealed class DishcoverDbContext(DbContextOptions<DishcoverDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Post> Posts => Set<Post>();
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<Story> Stories => Set<Story>();
    public DbSet<StoryComment> StoryComments => Set<StoryComment>();
    public DbSet<StoryReaction> StoryReactions => Set<StoryReaction>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(user => user.Email).IsUnique();
            entity.HasIndex(user => user.Username).IsUnique();
            entity.Property(user => user.Name).HasMaxLength(50);
            entity.Property(user => user.Username).HasMaxLength(31);
            entity.Property(user => user.Email).HasMaxLength(254);
            entity.Property(user => user.AccountType).HasMaxLength(24);
            entity.Property(user => user.Location).HasMaxLength(70);
            entity.Property(user => user.Website).HasMaxLength(300);
            entity.Property(user => user.Bio).HasMaxLength(150);
        });

        modelBuilder.Entity<Post>(entity =>
        {
            entity.HasIndex(post => post.CreatedAt);
            entity.Property(post => post.Title).HasMaxLength(100);
            entity.Property(post => post.Cuisine).HasMaxLength(40);
            entity.Property(post => post.Meal).HasMaxLength(40);
            entity.Property(post => post.CookingTime).HasMaxLength(30);
        });

        modelBuilder.Entity<Conversation>(entity =>
        {
            entity.HasIndex(conversation => new { conversation.UserId, conversation.UpdatedAt });
            entity.Property(conversation => conversation.Theme).HasMaxLength(20);
            entity.Property(conversation => conversation.Nickname).HasMaxLength(50);
            entity.Property(conversation => conversation.DefaultEmoji).HasMaxLength(20);
            entity.HasMany(conversation => conversation.Messages)
                .WithOne(message => message.Conversation)
                .HasForeignKey(message => message.ConversationId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Message>(entity =>
        {
            entity.HasIndex(message => new { message.ConversationId, message.CreatedAt });
            entity.Property(message => message.Sender).HasMaxLength(10);
            entity.Property(message => message.Text).HasMaxLength(500);
            entity.Property(message => message.Reaction).HasMaxLength(10);
        });

        modelBuilder.Entity<Story>(entity =>
        {
            entity.HasIndex(story => story.ExpiresAt);
            entity.Property(story => story.CreatorName).HasMaxLength(50);
            entity.Property(story => story.CreatorUsername).HasMaxLength(31);
            entity.Property(story => story.Caption).HasMaxLength(300);
            entity.HasMany(story => story.Comments)
                .WithOne(comment => comment.Story)
                .HasForeignKey(comment => comment.StoryId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(story => story.Reactions)
                .WithOne(reaction => reaction.Story)
                .HasForeignKey(reaction => reaction.StoryId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<StoryComment>(entity =>
        {
            entity.HasIndex(comment => new { comment.StoryId, comment.CreatedAt });
            entity.Property(comment => comment.AuthorName).HasMaxLength(50);
            entity.Property(comment => comment.Text).HasMaxLength(300);
        });

        modelBuilder.Entity<StoryReaction>(entity =>
        {
            entity.HasIndex(reaction => new { reaction.StoryId, reaction.UserId }).IsUnique();
            entity.Property(reaction => reaction.Emoji).HasMaxLength(10);
        });
    }
}
