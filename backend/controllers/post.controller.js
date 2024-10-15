import sharp from "sharp";
import cloudinary from "../utils/cloudinary.js";
import { Post } from "../models/post.model.js";
import User from "../models/user.model.js";
import { Comment } from "../models/comment.model.js";

export const addNewPost = async (req, res) => {
  try {
    const { caption } = req.body;
    const image = req.file;
    const authorId = req.id;

    if (!image)
      return res.status(400).json({
        message: "Image required",
      });

    const optimisedImageBuffer = await sharp(image.buffer)
      .resize({ width: 800, height: 800, fit: "inside" })
      .toFormat("jpeg", { quality: 80 })
      .toBuffer();

    const fileUri = `data:image/jpeg;base64,${optimisedImageBuffer.toString(
      "base64"
    )}`;
    const cloudResponse = await cloudinary.uploader.upload(fileUri);
    const post = await Post.create({
      caption,
      image: cloudResponse.secure_url,
      author: authorId,
    });

    const user = await User.findById(authorId);
    if (user) {
      user.posts.push(post._id);
      await user.save();
    }

    await post.populate({ path: "author", select: "-password" });
    return res.status(201).json({
      message: "New post added successfully",
      post,
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};

export const getAllPost = async (req, res) => {
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate({ path: "author", select: "username, profilePicture" })
      .populate({
        path: "comments",
        sort: { createdAt: -1 },
        populate: {
          path: "author",
          select: "username, profilePicture",
        },
      });
    return res.status(200).json({
      posts,
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};

export const getUserPost = async (req, res) => {
  try {
    const authorId = req.id;
    const posts = await Post.find({ author: authorId })
      .sort({ createdAt: -1 })
      .populate({ path: "author", select: "username,profilePicture" })
      .populate({
        path: "comments",
        sort: { createdAt: -1 },
        populate: {
          path: "author",
          select: "username,profilePicture",
        },
      });

    return res.status(200).json({
      posts,
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};

export const likePost = async (req, res) => {
  try {
    const likeKarneWalaUserkiId = req.id;
    const postId = req.params.id;
    const post = await Post.findById(postId);
    if (!post)
      return res.status(404).json({
        message: "post not found",
        success: false,
      });

    await post.updateOne({ $addToSet: { likes: likeKarneWalaUserkiId } });
    await post.save();

    const user = await User.findById(likeKarneWalaUserkiId).select(
      "username,profilePicture"
    );

    const postOwnerId = post.author.toString();
    if (postOwnerId !== likeKarneWalaUserkiId) {
      const notification = {
        type: "like",
        userId: likeKarneWalaUserkiId,
        userDetails: user,
        postId,
        message: "your post was liked",
      };

      const postOwnerSocketId = getReceiverSocketId(postOwnerId);
      io.to(postOwnerSocketId).emit("notification", notification);
    }

    return res.status(200).json({
      message: "post liked",
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};

export const dislikePost = async (req, res) => {
  try {
    const likeKarneWalaUserkiId = req.id;
    const postId = req.params.id;
    const post = await Post.findById(postId);
    if (!post)
      return res.status(404).json({
        message: "Post not found",
        success: false,
      });

    await post.updateOne({ $pull: { likes: likeKarneWalaUserkiId } });
    await post.save();

    const user = await User.findById(likeKarneWalaUserkiId).select(
      "username,profilePicture"
    );
    const postOwnerId = post.author.toString();
    if (postOwnerId !== likeKarneWalaUserkiId) {
      // emit a notification event
      const notification = {
        type: "dislike",
        userId: likeKarneWalaUserkiId,
        userDetails: user,
        postId,
        message: "Your post was liked",
      };
      const postOwnerSocketId = getReceiverSocketId(postOwnerId);
      io.to(postOwnerSocketId).emit("notification", notification);
    }
    return res.status(200).json({
      message: "Post disliked",
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};

export const addComment = async (req, res) => {
  try {
    const postId = req.params.id;
    const commentKarneWalaUserKiId = req.id;

    const { text } = req.body;

    const post = await Post.findById(postId);

    if (!text)
      return res.status(400).json({
        message: "text is required",
        success: false,
      });

    const comment = await Comment.create({
      text,
      author: commentKarneWalaUserKiId,
      post: postId,
    });

    await comment.populate({
      path: "author",
      select: "username,profilePicture",
    });

    post.comments.push(comment._id);
    await post.save();

    return res.status(201).json({
      message: "Comment added",
      comment,
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};

export const getCommentsOfPost = async (req, res) => {
  try {
    const postId = req.params.id;
    const comments = await Comment.find({ post: postId }).populate(
      "author",
      "username,profilePicture"
    );

    if (!comments)
      return res.status(404).json({
        message: "No comments comments found for this post",
        success: false,
      });

    return res.status(200).json({
      success: true,
      comments,
    });
  } catch (error) {
    console.log(error);
  }
};

export const deletePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const authorId = req.id;

    const post = await Post.findById(postId);
    if (!post)
      return res.status(400).json({
        message: "Post not found",
        success: false,
      });

    if (post.author.toString() !== authorId)
      return res.status(403).json({
        message: "unauthorized",
      });

    await Post.findByIdAndDelete(postId);

    let user = await User.findById(authorId);
    user.posts = user.posts.filter((id) => id.toString() !== postId);
    await user.save();

    await Comment.deleteMany({ post: postId });

    return res.status(200).json({
      success: true,
      message: "post deleted successfully",
    });
  } catch (error) {
    console.log(error);
  }
};

export const bookmarkPost = async (req, res) => {
  try {
    const postId = req.params.id;
    const authorId = req.id;
    const post = await Post.findById(postId);
    if (!post)
      return res.status(404).json({
        message: "post not found",
        success: false,
      });

    const user = await User.findById(authorId);

    if (user.bookmarks.includes(post._id)) {
      await user.updateOne({ $pull: { bookmarks: post._id } });
      await user.save();
      return res.status(200).json({
        type: "unsaved",
        message: "post removed from bookmark",
        success: true,
      });
    } else {
      await user.updateOne({ $addToSet: { bookmarks: post._id } });
      await user.save();
      return res.status(200).json({
        type: "saved",
        message: "post bookmarked",
        success: true,
      });
    }
  } catch (error) {
    console.log(error);
  }
};
