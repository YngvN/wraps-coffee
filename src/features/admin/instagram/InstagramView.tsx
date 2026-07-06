import { AnimatePresence, motion } from 'framer-motion'
import { Button, Input, TranslatedText } from '../../../components'
import { useInstagramPosts } from '../../../hooks/useInstagramPosts'
import { useLanguage } from '../../../i18n'
import './InstagramView.scss'

/** Admin view for editing the Instagram post thumbnails shown in the homepage carousel. */
export function InstagramView() {
  const { t } = useLanguage()
  const [posts, setPosts] = useInstagramPosts()

  const updatePost = (id: string, field: 'imageUrl' | 'postUrl' | 'alt', value: string) => {
    setPosts(posts.map((post) => (post.id === id ? { ...post, [field]: value } : post)))
  }

  const addPost = () => {
    setPosts([...posts, { id: `${Date.now()}`, imageUrl: '', postUrl: '', alt: '' }])
  }

  const removePost = (id: string) => {
    setPosts(posts.filter((post) => post.id !== id))
  }

  return (
    <div className="instagram-view">
      <TranslatedText as="h1" id="admin.instagram.title" />
      <ul className="instagram-view__list">
        <AnimatePresence initial={false}>
          {posts.map((post) => (
            <motion.li key={post.id} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
              {post.imageUrl && <img className="instagram-view__preview" src={post.imageUrl} alt="" />}
              <div className="instagram-view__fields">
                <Input
                  id={`instagram-image-${post.id}`}
                  label={t('admin.instagram.imageUrlLabel')}
                  value={post.imageUrl}
                  onChange={(event) => updatePost(post.id, 'imageUrl', event.target.value)}
                />
                <Input
                  id={`instagram-post-${post.id}`}
                  label={t('admin.instagram.postUrlLabel')}
                  value={post.postUrl}
                  onChange={(event) => updatePost(post.id, 'postUrl', event.target.value)}
                />
                <Input
                  id={`instagram-alt-${post.id}`}
                  label={t('admin.instagram.altLabel')}
                  value={post.alt}
                  onChange={(event) => updatePost(post.id, 'alt', event.target.value)}
                />
              </div>
              <Button variant="secondary" onClick={() => removePost(post.id)}>
                {t('admin.common.delete')}
              </Button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <Button onClick={addPost}>{t('admin.instagram.addPost')}</Button>
    </div>
  )
}
